# Spec 00: Logging architecture (target design)

Status: **Approved design**. All other specs in this folder build on it.

## 1. Problem statement

The current design treats three different log streams the same way and puts all of them in SurrealDB:

| Table | Observed size (2026-10) | Write rate | Read pattern |
|---|---|---|---|
| `access_logs` | ~629K rows (most of 422 MB) | 1 row per HTTP request | Seldom: dashboard chart, occasional search |
| `error_logs` | ~1.4K rows | Low | Triage (read/unread) |
| `activity_logs` | small | Low | Audit trail |

Root causes found in the code (see `server/utils/logging*.ts`):

1. **Retention is never enforced.** `retention_*_days` settings exist and appear in the UI, but no job deletes old rows. Only the manual cleanup button does.
2. **The Docker healthcheck is logged.** `panda health` sends `GET /` every 30 s, which is about 2,880 SSR renders and access rows per day.
3. **High-volume, low-value data goes to the primary DB.** Every request goes through an NDJSON buffer, then a bulk `INSERT`, then updates to 3 indexes. The data is also included in every full backup.
4. **Large deletes are inefficient.** `DELETE … RETURN BEFORE` returns every deleted row just to count it. With 600K rows this can hit the 30 s timeout.
5. **Nothing reaches stdout by default.** `console_output=false`, so `docker logs` shows almost nothing.
6. **Errors are not grouped.** The same bug creates N rows. 4xx errors (401/404) caught by the Nitro `error` hook add noise.

## 2. Principles

1. **Store each stream where its access pattern fits.** High-volume, append-only data goes to files and stdout. Low-volume data that needs triage or auditing goes to the DB.
2. **Logging must never break or slow a request.** All sinks are fire-and-forget, failures are swallowed or circuit-broken, and nothing on the request path waits for the DB.
3. **Every store has an enforced retention.** No table or directory grows without bound.
4. **stdout is the universal sink.** One JSON object per line, so `docker logs`, `jq`, and any future collector (Loki, Vector, …) work without code changes.
5. **The operator controls it with env vars.** Console behaviour must be configurable without a working DB or admin UI.
6. **Keep the existing admin UX where reasonable.** API response shapes stay compatible unless a spec says otherwise.

## 3. Target architecture

```
                         ┌─────────────────────────────────────────────────┐
HTTP request ──► access-logging middleware                                 │
                         │                                                 │
                         ├─► console sink  (LOG_CONSOLE=all)  ─► stdout ───┼─► docker logs (json-file, rotated)
                         └─► access file store                             │
                               storage/logs/access/access-YYYY-MM-DD.ndjson[.gz]
                               ▲  read by admin Access tab / hourly chart
                                                                           │
Nitro `error` hook / logError()                                            │
                         ├─► console sink  (LOG_CONSOLE=errors|all) ─► stderr
                         └─► DB: error_groups (1 row per fingerprint)      │
                                 error_logs   (capped occurrences/group)   │
                                                                           │
recordActivity() / logActivity()                                           │
                         ├─► console sink  (LOG_CONSOLE=all) ─► stdout ────┘
                         └─► DB: activity_logs (audit trail, unchanged)

log-retention plugin (daily cron + deferred boot run)
   ├─ batched DELETE of expired activity_logs / error_logs / error_groups
   └─ unlink expired access files, gzip yesterday's file

backups: no access logs (table removed in Phase 2; excluded in Phase 1)
```

## 4. Module and file layout (end state)

| Path | Responsibility |
|---|---|
| `server/utils/log-console.ts` | **New (LOG-1.1).** Console sink: mode/format resolution, JSON line formatting, redaction-safe serialization. |
| `server/utils/logging.ts` | Public logging API (`logAccess`, `logActivity`, `logError`, `debug/info/warn/error`), settings cache. Routes entries to sinks. |
| `server/utils/logging-logic.ts` | Pure helpers (unit-testable): filtering, redaction, trimming. Add new pure helpers here. |
| `server/utils/log-retention.ts` | **New (LOG-1.3/1.4).** Batched deletion and the retention runner. |
| `server/plugins/log-retention.ts` | **New (LOG-1.4).** Schedules the retention runner. |
| `server/utils/access-log-store.ts` | **New (LOG-2.1/2.2).** Daily NDJSON writer, rotation, gzip, file retention. |
| `server/utils/access-log-reader.ts` | **New (LOG-2.3).** Query engine over access files (filter, sort, page, detail, stats, hourly). |
| `server/utils/error-fingerprint.ts` | **New (LOG-3.1).** Pure fingerprint function. |
| `server/utils/logging-access-buffer.ts` | **Deleted in LOG-2.7.** |
| `server/plugins/access-log-flush.ts` | **Deleted in LOG-2.7.** |
| `server/api/health.get.ts` | **New (LOG-1.5).** Lightweight health endpoint. |

## 5. Settings model changes (summary)

`LoggingSettings` (`types/logging.ts`) changes over the phases:

| Field | Change | Task |
|---|---|---|
| `console_output` | Kept. Semantics change to *"upgrade console mode to `all`"* (see spec 01 §3). UI label/description updated. | LOG-1.1 |
| `error_log_min_status` | **New**, int 400–599, default `500`. Nitro-hook errors with lower status are not stored or printed. | LOG-1.2 |
| `excluded_paths` | Default list extended (spec 03 §3); one-time merge into stored settings. | LOG-1.6 |
| `retention_*_days` | Same fields. Now **enforced** by the scheduler. | LOG-1.4 |
| `sampling_rate` | Kept. Applies to the access file store. | — |
| `error_occurrences_per_group` | **New**, int 1–500, default `50`. | LOG-3.3 |

Backup settings (`server/utils/settings.ts`, backup section):

| Field | Change | Task |
|---|---|---|
| `include_access_logs` | **New**, boolean, default `false`. | LOG-1.7 |

Env vars (operator-level; not stored in the DB):

| Var | Values | Default | Task |
|---|---|---|---|
| `LOG_CONSOLE` | `off` \| `errors` \| `all` | `errors` | LOG-1.1 |
| `LOG_FORMAT` | `json` \| `pretty` | `json` in production, `pretty` in dev | LOG-1.1 |

Whenever a settings field is added, update **all** of the following: `types/logging.ts`, `defaultLoggingSettings()`, `updateSchema` (zod), `normalizeSettingsRecord()`, `tests/unit/logging-logic.test.ts → baseSettings()`, `pages/admin/dashboard/logs/settings.vue` (form, payload, reset defaults), and i18n keys in **both** `i18n/locales/en.json` and `i18n/locales/zh-CN.json`.

## 6. Cross-cutting rules for implementers

- **Module flags.** Respect the build-time `__PB_MODULE_LOGS__` flag and the runtime `resolveModuleFlags()` flags (`logs`, `accessLogs`, `activityLogs`, `errorLogs`). Plugins must be no-ops when logs are disabled. Schema for log tables lives inside the `-- #module logs start/end` section of `server/utils/schema.surql`.
- **DB access.** Use `queryDb(db, sql, params, { label, timeoutMs, retryOnReconnect })` and always give a descriptive `label`. Background jobs use `retryOnReconnect: false`.
- **Migrations.** Use the existing marker pattern in `server/plugins/db-init.ts` (`setAppSetting(db, '__<name>_v1', …)`). Run heavy migrations in `runDeferredBackfills` so they don't block boot.
- **Cron.** Reuse the `node-cron` loading pattern from `server/plugins/download-cleanup.ts` (`createRequire` + `normalize…Cron`). Extract it into a shared helper `server/utils/cron.ts` when it is first needed (LOG-1.4).
- **Never log secrets.** Everything sent to any sink goes through `redactDeep` with `settings.redact_fields`.
- **Time.** All file names and day buckets use **UTC**.
- **Definition of done (every task).** Code + unit tests for pure logic. `npm run lint`, `npm run typecheck`, and `npm run test:unit` all pass. `docs/logging/progress.md` updated.
