# Spec 02: Batched deletion and scheduled retention

Tasks: **LOG-1.3**, **LOG-1.4** (extended by LOG-2.2 and LOG-3.7)

## 1. Goal

Each log store is automatically trimmed to its `retention_*_days`. Large deletes never time out, never load deleted rows into memory, and never block requests for long.

## 2. Batched deletion helper (LOG-1.3)

New file `server/utils/log-retention.ts`.

```ts
export async function deleteLogsOlderThan(
  table: 'access_logs' | 'activity_logs' | 'error_logs' | 'error_groups',
  cutoff: Date,
  opts?: { batchSize?: number; pauseMs?: number; maxBatches?: number; timeField?: string }
): Promise<number>
```

Algorithm (per batch, default `batchSize = 2000`, `pauseMs = 50`, `maxBatches = 10_000`):

```sql
LET $ids = (SELECT VALUE id FROM type::table($table)
            WHERE <timeField> < <datetime>$cutoff
            ORDER BY <timeField> ASC LIMIT $batch);
DELETE $ids RETURN NONE;
RETURN array::len($ids);
```

- Loop until the returned count `< batchSize` or `maxBatches` is reached. Sum the counts.
- `await sleep(pauseMs)` between batches so request traffic can interleave.
- `timeField` defaults to `timestamp`, but `error_groups` uses `last_seen` (Phase 3).
- Each batch is one `queryDb` call with label `retention delete <table>`, `timeoutMs: 30_000`, `retryOnReconnect: false`.
- Validate `table` against the allowlist. `timeField` is a hardcoded literal, never user input.
- Verify the SurQL against the SurrealDB version in use (v2/v3). If `DELETE $ids` with an array of record ids is not supported, fall back to `DELETE FROM type::table($table) WHERE id IN $ids RETURN NONE`.

Also add:

```ts
export async function deleteLogsKeepLatest(table, keep: number): Promise<number>
// find cutoff timestamp at offset `keep` (existing query), then deleteLogsOlderThan(table, cutoff)

export async function purgeLogTable(table): Promise<number>
// count first (SELECT count() … GROUP ALL), then batched delete with cutoff = far future
```

Refactor these callers to use the helpers and stop using `RETURN BEFORE`:
- `runManualLogCleanup` → `deleteLogsOlderThan` / `deleteLogsKeepLatest`
- `purgeLogType` → `purgeLogTable`
- Remove the private `deleteOlderThan` / `deleteBeyondLatest` from `logging.ts`.
- Remove the `RETURN BEFORE` counts in `deleteErrorLogsByIds`, which are bounded at 200 and fine to keep. **Leave them as they are.**

For `access` in manual cleanup and purge, keep calling `flushAccessBuffer()` first until Phase 2 removes it.

## 3. Retention runner (LOG-1.4)

```ts
export interface RetentionReport {
  started_at: string; finished_at: string; duration_ms: number
  deleted: { access: number; activity: number; errors: number; error_groups?: number; access_files?: number }
  errors: string[]
}
export async function runLogRetention(now = new Date()): Promise<RetentionReport>
```

- Uses `getLoggingSettings()` (call `initializeLoggingSettings()` first if needed).
- For each enabled stream (module flags + settings): cutoff = `now - retention_<x>_days * 86_400_000`, then `deleteLogsOlderThan`.
- Each stream runs in its own try/catch. One failure doesn't stop the others; the message goes into `errors[]`.
- **Single-flight:** a module-level `running` promise. A concurrent call returns the in-flight promise.
- At the end:
  - `logActivity({ action: 'system.log_retention', resource_type: 'logging', metadata: report, description: 'Scheduled log retention removed N rows' })` **only if** total deleted > 0 or errors exist.
  - If `errors.length`, write a `warn` console line through the sink (spec 01).
- Store the last report in memory (`getLastRetentionReport()`) for the settings UI.

## 4. Scheduler plugin (LOG-1.4)

New file `server/plugins/log-retention.ts`:

- Returns immediately if `!__PB_MODULE_LOGS__` or `!resolveModuleFlags(...).logs`.
- Loads `node-cron` through the shared helper `server/utils/cron.ts`, which is extracted from `download-cleanup.ts`. Refactor `download-cleanup.ts` to use the helper too, without changing its behaviour.
- Schedule: `'17 3 * * *'` (03:17 server time; UTC inside the container).
- **Deferred boot run:** `setTimeout(() => runLogRetention(), 5 * 60_000).unref()`. This catches up when the container restarts often and the cron time is missed. On the **first** production run it removes the historical backlog (e.g. ~600K rows), which is why batching matters.
- On the `close` hook, stop the cron task and clear the timeout.

## 5. Admin visibility (LOG-1.4)

- `GET /api/admin/logs/retention` (superadmin) returns `{ last: RetentionReport | null, schedule: '17 3 * * *' }`.
- `POST /api/admin/logs/retention/run` (superadmin) triggers `runLogRetention()` and returns the report. It shares the single-flight guard.
- `settings.vue`: in the retention section, show "Last run: <time>, removed N rows" plus a **Run now** button. i18n keys go in en + zh-CN.

## 6. Tests

`tests/unit/log-retention.test.ts` (mock `queryDb` / `useDb` with `vi.mock`):
- Batching loop: stops when a batch is short, respects `maxBatches`, sums correctly.
- Allowlist rejects unknown tables.
- Runner: cutoffs computed from settings and `now`; disabled streams skipped; one stream failing still runs the others; single-flight returns the same promise.
- Activity entry is written only when something was deleted or failed.

## 7. Acceptance criteria

- [ ] On a DB with 600K old access rows, the first run finishes without timeouts and without memory spikes (no `RETURN BEFORE`).
- [ ] After the run, `SELECT count() FROM access_logs WHERE timestamp < time::now() - 30d GROUP ALL` returns 0.
- [ ] Manual cleanup and purge in the UI still work and report correct counts.
- [ ] Note: SurrealDB may not shrink files on disk right away (storage-engine compaction). Record the before/after disk size in progress.md.
