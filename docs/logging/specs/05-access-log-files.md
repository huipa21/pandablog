# Spec 05: Access logs in rotating files instead of the DB

Tasks: **LOG-2.1 … LOG-2.7**

## 1. Goal

Access logs leave SurrealDB completely. They are written to daily NDJSON files under `storage/logs/access/`, compressed after the day ends, deleted after `retention_access_days`, and still browsable from the admin **Access** tab and dashboard chart.

## 2. Storage layout

```
storage/logs/
  access/
    access-2026-05-20.ndjson        ← today (UTC), append-only, plain text
    access-2026-05-19.ndjson.gz     ← previous days, gzip
    access-2026-05-18.ndjson.gz
    .index.json                     ← stats cache (§6.4), safe to delete
  access-buffer.ndjson              ← legacy (Phase 1); removed by LOG-2.7 migration
```

- `storage/` is bind-mounted (`./app-storage`), so files survive container rebuilds.
- `storage/logs` is already git-ignored and docker-ignored.
- Directory override: env `ACCESS_LOG_DIR` (default `storage/logs/access`, resolved from `process.cwd()`).

### Line schema (one JSON object per line)

```json
{"ts":"2026-05-20T10:12:03.123Z","id":"6f0c…","m":"GET","p":"/posts/hello","s":200,"d":12,"ip":"1.2.3.4","ua":"Mozilla/…","ref":"https://…","q":{"page":"2"}}
```

| Key | Source field (`AccessLogEntry`) | Notes |
|---|---|---|
| `ts` | timestamp | ISO UTC |
| `id` | request_id | UUID; used as the record id |
| `m` | method | |
| `p` | path | |
| `s` | status_code | |
| `d` | response_time_ms | |
| `ip`, `ua`, `ref` | ip, user_agent, referrer | omitted when null |
| `q` | query_params | redacted + trimmed, omitted when empty |

Short keys keep the files about 40 % smaller. The reader (§6) maps lines back to the **existing API row shape** (`timestamp, method, path, status_code, response_time_ms, ip, user_agent, request_id, query_params, referrer, id`), so the UI keeps working.

## 3. Writer (LOG-2.1)

New file `server/utils/access-log-store.ts`:

```ts
export function appendAccessLog(entry: AccessLogEntry): void      // sync API, never throws
export async function closeAccessLogStore(): Promise<void>        // flush + close (nitro 'close' hook)
export function accessLogDir(): string
export function fileNameForDate(d: Date): string                  // pure: access-YYYY-MM-DD.ndjson
```

- Keep one `fs.WriteStream` (`flags: 'a'`) for the current UTC day. On each append, compute the day key. If it differs from the open stream's day, `end()` the old stream and open a new one (rotation).
- Writes are serialized by the stream itself, so no manual promise chain is needed. Handle the stream `'error'` event: log one `warn` line through the console sink, drop the stream, and retry opening on the next append (back off 60 s after repeated failures).
- **Backpressure / memory guard:** if `stream.writableLength > 8 MB`, drop entries and count them (`droppedSinceLastWarn`). Emit a warn line at most once per minute.
- `logAccess()` in `logging.ts` calls `appendAccessLog` **instead of** `bufferAccessLog`. Keep the existing filtering (`shouldRecordAccessLog`, sampling, redaction).
- Register a Nitro plugin (it can replace `access-log-flush.ts`) that calls `closeAccessLogStore()` on `close`.
- No DB access anywhere in this file.

## 4. Compression and file retention (LOG-2.2)

In `access-log-store.ts`:

```ts
export async function maintainAccessLogFiles(now: Date, retentionDays: number): Promise<{ compressed: number; deleted: number }>
```

1. **Compress:** every `access-*.ndjson` whose day is **before today (UTC)** is gzip-streamed to `<name>.gz.tmp`, fsynced, renamed to `.gz`, and then the plain file is unlinked. If a `.gz` already exists (crash recovery), verify it can be read and remove the leftover plain file, or redo the compression.
2. **Delete:** remove files (`.ndjson` or `.ndjson.gz`) whose day is `< today - retentionDays`.
3. Ignore unknown files. Never follow symlinks. Validate names with `/^access-\d{4}-\d{2}-\d{2}\.ndjson(\.gz)?$/`.

Hook it into `runLogRetention` (spec 02): it replaces the DB delete for `access`, and the report field is `deleted.access_files`. Also run the compression step from the scheduler shortly after midnight UTC (`'5 0 * * *'`) so yesterday's file is compressed promptly. Use the same single-flight guard.

## 5. Volume expectations

About 250 bytes per line, so 10K requests/day ≈ 2.5 MB/day plain, ≈ 0.3 MB gzipped. 30 days ≈ 10–15 MB in total, compared with hundreds of MB in the DB today.

## 6. Reader / query engine (LOG-2.3)

New file `server/utils/access-log-reader.ts`. It is pure over an injected file-system interface where practical, so it can be unit tested with temp dirs.

### 6.1 List

```ts
export interface AccessQuery {
  from?: Date; to?: Date                // default: to = now, from = now - 7d
  path?: string; method?: string
  status?: number; min_status?: number; max_status?: number
  search?: string                       // case-insensitive substring on path or ua
  limit: number; offset: number; sort: 'newest' | 'oldest'
  includeTotal: boolean
}
export async function queryAccessLogs(q: AccessQuery): Promise<ListLogsResult & { truncated: boolean }>
```

Algorithm:
- Pick the day files that overlap `[from, to]`, ordered by `sort`.
- Stream each file (`readline` over `createReadStream` + `createGunzip` for `.gz`). Parse each line safely, skip bad lines, and apply the filters.
- `newest`: lines within one file are in ascending order. Collect the matches of a day file into an array and iterate it in reverse. Memory is bounded by one day's **matches**, with a hard cap of 200K matched rows per file. When the cap is exceeded, set `truncated = true`.
- Skip `offset` matches, collect `limit` matches.
- If `includeTotal`, keep counting matches to the end of the range. Otherwise stop as soon as `limit` rows are collected (early exit).
- **Scan budget:** stop after scanning 2M lines or 3 s wall time, and return `truncated: true`. The `total` is then a lower bound.
- `ListLogsResult` shape is unchanged. The new `truncated` flag is additive.

### 6.2 Detail

`readAccessLogById(id)`. The id format is `YYYY-MM-DD:<request_id>`. The list rows return this as `id`, so the existing `[type]/[id].get.ts` keeps working. The reader scans only that day's file. A legacy id without a date prefix returns 404.

### 6.3 Hourly series (LOG-2.5)

`accessHourly(hours = 24, now)` returns `Array<{ hour: string /*ISO*/, count: number, errors: number /* s>=500 */ }>` built from the last 1–2 day files.

### 6.4 Stats

`accessStats()` returns `{ count, oldest, newest, bytes, files }`.
- `bytes`, `files`, `oldest`, `newest` come from directory listing and file names (cheap).
- `count`: the line counts of closed (`.gz`) files are cached in `.index.json` (`{ [fileName]: { size, mtimeMs, lines } }`). The count is invalidated when size or mtime changes. Today's file is counted live; it's small.

## 7. API rewiring (LOG-2.4)

| Endpoint | Change |
|---|---|
| `GET /api/admin/logs/access` | `listLogs(event,'access')` → maps query params to `AccessQuery` and calls `queryAccessLogs`. Same params as today. |
| `GET /api/admin/logs/access/:id` (`[type]/[id].get.ts`) | `type==='access'` → `readAccessLogById`. |
| `GET /api/admin/logs/access/export` | Streams the result. CSV/JSON is capped at 10K rows (same as today). |
| `GET /api/admin/logs/stats` | `access` block from `accessStats()`. `estimate_bytes` is replaced by `{ db_estimate_bytes, access_files_bytes }`. Update `index.vue`. |
| `DELETE /api/admin/logs/access` (purge) | Deletes all access files (except the open one, which is truncated). Returns the number of lines removed (from stats). |
| `POST /api/admin/logs/cleanup` `type:'access'` | `older_than_days` → deletes whole day files older than N. `keep_latest` → **not supported** for access; return 400 with a clear message and hide the option in the UI for access. |
| `GET /api/admin/logs/access/hourly` | **New** (LOG-2.5). |

Keep `logging-admin.ts → listLogs` for activity and errors. Branch on access at the top of it, or split the code; the implementer chooses, but the code must stay readable.

## 8. UI changes (LOG-2.6)

- `pages/admin/dashboard/logs/access.vue`: default date range is the last 24 h (from/to pickers allow up to retention). If `truncated`, show "Showing first results; narrow the date range for exact totals" and display the total as `N+`.
- `pages/admin/dashboard/logs/index.vue`: the requests-per-hour chart uses `/access/hourly`. The current version derives it from 200 rows, which is wrong at real traffic. Replace the "DB estimate" card with "Storage: DB ~X, access files Y".
- `settings.vue`: the cleanup section hides `keep_latest` for access. Retention help text: "Access log files older than N days are deleted daily."
- i18n en + zh-CN for every new string.

## 9. Migration (LOG-2.7)

A deferred, marker-guarded migration `__access_logs_to_files_v1` in `db-init.ts → runDeferredBackfills`:

1. If the table `access_logs` doesn't exist (`INFO FOR DB`), set the marker and return.
2. **Export** the rows with `timestamp >= now - retention_access_days`, in pages of 5,000 ordered by `timestamp ASC` (cursor = last timestamp + id, not OFFSET). Write them into the matching day files using the line schema in §2. Write each day to `access-YYYY-MM-DD.ndjson.migrating` first and then merge: if a live file for that day exists, the migrated lines are **prepended** by writing a new file (`migrated + existing`) and renaming it atomically. Gzip past days afterwards (call `maintainAccessLogFiles`).
3. Drain the legacy `storage/logs/access-buffer.ndjson` (and any `*.flushing` files) into the day files the same way, then delete them.
4. `REMOVE TABLE access_logs;` This needs the root client: run this step in the boot phase on the next start if the marker shows the export finished. Use two markers, `__access_logs_exported_v1` → `__access_logs_table_removed_v1`.
5. Remove the `access_logs` DEFINE statements from `schema.surql`. This changes the schema hash, which is expected.

Safety:
- Idempotent: rerunning after a crash in the middle of the export must not duplicate lines. Use the `.migrating` files plus a marker that stores the last exported cursor.
- Log progress via the console sink (`kind:"app"`, every 50K rows).
- Rows older than retention are **not** exported. They are dropped with the table.

Code removal in the same task: `server/utils/logging-access-buffer.ts`, `server/plugins/access-log-flush.ts`, every `flushAccessBuffer()` call, `access_logs` in `logging-admin.ts` table specs, and the `access_logs` entries in the backup settings/spec 04 code (`include_access_logs` becomes a no-op. Remove the setting and the UI checkbox).

## 10. Tests

`tests/unit/access-log-store.test.ts` and `access-log-reader.test.ts`, using `os.tmpdir()` fixtures:
- File naming and UTC day rotation across midnight (inject the clock).
- Compression: plain file → `.gz`, content identical, crash leftovers handled.
- Retention: deletes only files outside the window, ignores unknown names.
- Reader: filters (each one), newest/oldest ordering across multiple files incl. `.gz`, offset/limit paging, early exit without total, `truncated` when the budget is exceeded, malformed lines skipped, detail by id, hourly buckets.
- Row mapping: line → API row shape (snapshot).
- Migration cursor logic as a pure function (row → day bucket, line serialization).

## 11. Acceptance criteria

- [ ] No `access_logs` table in `INFO FOR DB` after the migration. No DB writes per request (verify with SurrealDB logs or a query counter in dev).
- [ ] The Access tab lists, filters, paginates, shows detail, and exports as before (within the date window).
- [ ] The dashboard hourly chart shows correct counts for 24 h.
- [ ] Day files rotate at UTC midnight, past days are gzipped, files beyond retention disappear after the daily run.
- [ ] Disk: `du -sh app-storage/logs/access` is in the low tens of MB for 30 days at current traffic.
