# Spec 06: Grouped error logs

Tasks: **LOG-3.1 … LOG-3.7**

## 1. Goal

One bug equals one row in the error inbox, showing its count, first/last seen time, and a sample of recent occurrences. Read state is tracked per **group**, so marking a bug as read doesn't hide it if it starts happening again.

## 2. Fingerprint (LOG-3.1)

New pure module `server/utils/error-fingerprint.ts`:

```ts
export function normalizeMessage(message: string): string
export function topAppFrame(stack: string | null): string | null
export function normalizeRoute(path: string | null): string | null
export function errorFingerprint(input: { name?: string; message: string; stack?: string | null; path?: string | null; status?: number | null }): string
```

- `normalizeMessage`: replace UUIDs → `<uuid>`, SurrealDB record ids (`table:⟨…⟩` / `table:abc123`) → `<rid>`, hex ≥ 8 chars → `<hex>`, numbers → `<n>`, quoted strings longer than 32 chars → `<str>`. Collapse whitespace and truncate to 300 chars.
- `topAppFrame`: the first stack frame that does **not** contain `node_modules`, `node:internal`, or `(native)`. Strip line and column numbers and absolute path prefixes up to `/server/` or `/.output/server/` (so the frame stays stable across builds). Return `null` if there is no stack.
- `normalizeRoute`: replace path segments that look like ids (UUID, numeric, hex ≥ 8, record id) with `:id`. Drop the query string.
- `errorFingerprint` = first 16 hex chars of `sha256([name, normalizedMessage, topAppFrame ?? normalizedRoute, status >= 500 ? '5xx' : String(status)].join('|'))`.

Changing the algorithm later merges or splits groups. Version it: prefix `v1:` in the stored `fingerprint_version`, not in the hash itself.

## 3. Schema (LOG-3.2)

Add to the logs module section of `schema.surql`:

```sql
DEFINE TABLE OVERWRITE error_groups SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD IF NOT EXISTS fingerprint         ON error_groups TYPE string;
DEFINE FIELD IF NOT EXISTS fingerprint_version ON error_groups TYPE int DEFAULT 1;
DEFINE FIELD IF NOT EXISTS name                ON error_groups TYPE option<string>;
DEFINE FIELD IF NOT EXISTS message             ON error_groups TYPE string;      -- latest raw message
DEFINE FIELD IF NOT EXISTS route               ON error_groups TYPE option<string>;
DEFINE FIELD IF NOT EXISTS status_code         ON error_groups TYPE option<int>;
DEFINE FIELD IF NOT EXISTS level               ON error_groups TYPE string;
DEFINE FIELD IF NOT EXISTS count               ON error_groups TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS first_seen          ON error_groups TYPE datetime;
DEFINE FIELD IF NOT EXISTS last_seen           ON error_groups TYPE datetime;
DEFINE FIELD IF NOT EXISTS last_stack          ON error_groups TYPE option<string>;
DEFINE FIELD IF NOT EXISTS read_at             ON error_groups TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS resolved_at         ON error_groups TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS regressed           ON error_groups TYPE bool DEFAULT false;
DEFINE INDEX IF NOT EXISTS error_groups_last_seen ON error_groups FIELDS last_seen;
DEFINE INDEX IF NOT EXISTS error_groups_read      ON error_groups FIELDS read_at;

DEFINE FIELD IF NOT EXISTS fingerprint ON error_logs TYPE option<string>;
DEFINE INDEX IF NOT EXISTS error_logs_fingerprint ON error_logs FIELDS fingerprint;
```

The record id is the fingerprint: `error_groups:⟨<fingerprint>⟩`. This makes upserts atomic.

`error_logs` stays as the **occurrence** table (existing fields plus `fingerprint`, `status_code` from LOG-1.2). Keep `read_at` on occurrences for backward compatibility, but the UI no longer uses it after LOG-3.6.

## 4. Write path (LOG-3.3)

In `logError` (fire-and-forget, inside the existing circuit breaker), use one `queryDb` call:

```sql
UPSERT type::record('error_groups', $fp) SET
  fingerprint = $fp, fingerprint_version = 1,
  name = $name, message = $message, route = $route, status_code = $status, level = $level,
  last_stack = $stack,
  count = (count ?? 0) + 1,
  first_seen = first_seen ?? time::now(),
  last_seen = time::now(),
  regressed = IF resolved_at != NONE THEN true ELSE regressed END,
  resolved_at = NONE,
  read_at = IF resolved_at != NONE THEN NONE ELSE read_at END
RETURN NONE;
CREATE error_logs CONTENT $entry RETURN NONE;
```

Verify the SurQL against the deployed SurrealDB version. In particular, check how `SET` evaluates field references (some versions evaluate `resolved_at` after earlier assignments in the same `SET`; order the assignments so `regressed` and `read_at` read the **old** `resolved_at`, or compute them with a `LET $old = (SELECT … FROM ONLY …)` first).

**Occurrence cap** per group (`error_occurrences_per_group`, default 50): don't do it on every write. Run it in the retention runner (LOG-3.7): for each group with more than N occurrences, delete the oldest extras in batches. A temporary overflow is acceptable.

**Console line:** add `fingerprint` (spec 01 §4).

**Rate guard** (protects the DB from an error storm): in memory, per fingerprint, if more than 20 writes happen within 10 s, increment an in-memory counter instead of writing occurrences. The group `count` is still updated, at most once per second per fingerprint (`count = count + $pending`). Pure helper `createErrorRateGuard({ windowMs, max })` with unit tests.

New setting `error_occurrences_per_group` (follow spec 00 §5 checklist).

## 5. Backfill (LOG-3.4)

A deferred migration `__error_groups_backfill_v1`:
- Page through `error_logs` (cursor on `timestamp, id`, page size 1,000), compute the fingerprint from the stored message/stack/path/`status_code` (status is null for legacy rows, so treat it as 500), set `error_logs.fingerprint`, and upsert groups with the correct `count`, `first_seen`, `last_seen`.
- Optional: drop legacy rows that came from the Nitro hook with a 4xx status, if one is recorded. Legacy rows have no status, so leave them.
- Legacy `read_at` → the group is `read_at = max(read_at)` only if **all** of its occurrences were read.
- Idempotent: recompute the group counts from scratch at the end (`SELECT fingerprint, count(), math::min(timestamp), math::max(timestamp) FROM error_logs GROUP BY fingerprint`) and overwrite.

## 6. API (LOG-3.5)

| Endpoint | Description |
|---|---|
| `GET /api/admin/logs/error-groups` | Params: `status=unread\|read\|resolved\|all` (default `unread`), `search` (message/route), `from/to` on `last_seen`, `sort=last_seen\|count\|first_seen`, `limit/offset`. Returns `ListLogsResult` of groups. |
| `GET /api/admin/logs/error-groups/:fp` | `{ group, occurrences: error_logs[] (latest 50) }` |
| `POST /api/admin/logs/error-groups/bulk` | `{ action: 'mark_read'\|'mark_unread'\|'resolve'\|'unresolve'\|'delete', ids: string[] (≤200) }`. `delete` removes the group **and** its occurrences (batched). |
| `GET /api/admin/logs/errors` (existing) | Keeps working (occurrence list). It is used by the occurrence view and export. |
| `GET /api/admin/logs/stats` | The `errors` block adds `{ groups, unread_groups }`. |

All endpoints are superadmin-only and validated with zod (same style as `errors/bulk.post.ts`).

## 7. UI (LOG-3.6)

- `pages/admin/dashboard/logs/errors.vue` becomes a **grouped inbox**. Columns: status dot (unread / regressed badge), message (normalized + route), count, last seen (relative), first seen. Tabs: Unread / All / Resolved. Bulk actions: mark read/unread, resolve, delete.
- Clicking a group opens a detail panel with the latest stack, status code, a small occurrence timeline (counts per day from the occurrences), and an occurrence table (time, request_id, method, path, status). Clicking an occurrence opens the existing detail (`[type]/[id]`). Show the `request_id` with a copy button, and the hint "grep this id in docker logs".
- `index.vue` "Recent errors" lists the top 5 unread groups by `last_seen`. The card count shows unread groups.
- Admin nav badge (if one exists for errors) uses `unread_groups`.
- i18n en + zh-CN.

## 8. Retention (LOG-3.7)

Extend `runLogRetention`:
- Delete `error_logs` older than `retention_error_days` (already done in LOG-1.4).
- Delete `error_groups` whose `last_seen` is older than `retention_error_days` (`timeField: 'last_seen'`), together with their remaining occurrences.
- Enforce the occurrence cap per group (§4).
- Report `deleted.error_groups`.

## 9. Tests

- `error-fingerprint.test.ts`: the same bug with different ids, numbers, or UUIDs → same fingerprint; different top frame → different fingerprint; no stack → route used; minified/absolute paths are normalized; stable output (snapshot of known inputs → hashes).
- Rate guard tests.
- Backfill grouping as a pure function (`groupOccurrences(rows) → groups`).
- API zod schemas (valid/invalid payloads).

## 10. Acceptance criteria

- [ ] Throwing the same error 100 times creates 1 group with `count=100` and ≤ 50 occurrences after the retention run.
- [ ] Resolving a group, then triggering the error again → the group shows as unread and **regressed**.
- [ ] The backfill turns the existing ~1.4K rows into N groups, where N is recorded in progress.md.
- [ ] The dashboard shows the unread-group count. The errors page loads in < 300 ms with 1K groups.
