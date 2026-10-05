# Spec 00: Logging architecture (target design)

Status: **Implemented and verified locally (Phases 1–4)**. Production-copy, measured production outcomes and deployed acceptance remain operator gates in [progress.md](../progress.md). All other specs in this folder build on it; the final-image runbook is [operations.md](../operations.md).

## 1. Problem statement

### Historical production baseline (operator, 2026-10-04)

The old design put all three streams in SurrealDB:

| Metric | Measured baseline |
|---|---|
| `access_logs` | **635,189 rows** (dashboard estimate ~629K); 91,871 healthcheck rows (**14.5%**) |
| `error_logs` | **1,409 rows**, all from `nitro.error_hook`, mostly 4xx scanner noise |
| `activity_logs` | **8 rows** |
| Actual SurrealDB data volume | **210 MB**; dashboard DB estimate was ~422 MB, not disk usage |
| Latest full backup | **32.866 MB DB gzip + 1.875 MB media gzip** (~34.7 MB) |
| Container console | **22 lines in 10 hours** (~53/day); not an observed full-day count |

Root causes found in the old code:

1. Retention settings existed but no scheduled job enforced them.
2. The healthcheck sent `GET /` every 30 s: about 2,880 SSR renders/access rows per day.
3. Access traffic went through an NDJSON buffer, DB bulk inserts and three indexes, and into full backups.
4. Bulk `DELETE … RETURN BEFORE` loaded all deleted rows just to count them, risking timeouts at 600K scale.
5. `console_output=false` hid production errors from `docker logs` by default.
6. Errors were ungrouped, and hook-captured 401/404 noise obscured real bugs.

### Final implementation and measurement status (2026-10-05)

Access now uses persistent UTC files with gzip/day retention and no new access DB writes; the two-start migration removes the old table after receipt verification. Errors use fingerprinted groups with capped occurrence samples and independent stderr output. Activity remains in the DB. Retention runs at boot, daily, on the UTC compression schedule and on admin demand; `/api/health` is hard-excluded.

Local final verification evidence (disposable/synthetic fixtures, **not production measurements**):

| Check | Recorded local result |
|---|---|
| Two-start access migration | **12,502 unique entries** exported; next start removed the table; 40 controlled concurrent requests caused **zero access-related DB queries** |
| Access files immediately after migration | **2,135,868 bytes / 3 files** (sparse synthetic history; not a 30-day volume claim) |
| Error backfill | **1,409 synthetic occurrences → 1 group**; actual production group N remains unknown |
| Same-error storm | **100 counted errors / 20 retained samples** after trailing aggregation; retention cap and regression checks pass |
| Persistent production DB/file/backup deltas | **Not measured**; After P1/P2/P3 cells remain pending in progress.md |

No final production numbers were supplied during wrap-up. Do not infer disk savings, production backfill N, 30-day file volume or browser latency from these local fixtures. Approved production-copy rehearsal and deployed measurements remain release gates; update this section and progress.md when the operator provides them.

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
| `include_access_logs` | Interim LOG-1.7 field, **removed in LOG-2.7**. Legacy saved values are ignored/omitted; access files are not in DB/media backups. | LOG-1.7 → LOG-2.7 |

Env vars (operator-level; not stored in the DB):

| Var | Values | Default | Task |
|---|---|---|---|
| `LOG_CONSOLE` | `off` \| `errors` \| `all` | `errors` | LOG-1.1 |
| `LOG_FORMAT` | `json` \| `pretty` | `json` in production, `pretty` in dev | LOG-1.1 |
| `ACCESS_LOG_DIR` | Writable persistent directory | `storage/logs/access`, resolved from process cwd | LOG-2.1 |

Whenever a settings field is added, update **all** of the following: `types/logging.ts`, `defaultLoggingSettings()`, `updateSchema` (zod), `normalizeSettingsRecord()`, `tests/unit/logging-logic.test.ts → baseSettings()`, `pages/admin/dashboard/logs/settings.vue` (form, payload, reset defaults), and i18n keys in **both** `i18n/locales/en.json` and `i18n/locales/zh-CN.json`.

## 6. Cross-cutting rules for implementers

- **Module flags.** Respect the build-time `__PB_MODULE_LOGS__` flag and the runtime `resolveModuleFlags()` flags (`logs`, `accessLogs`, `activityLogs`, `errorLogs`). Plugins must be no-ops when logs are disabled. Schema for log tables lives inside the `-- #module logs start/end` section of `server/utils/schema.surql`.
- **DB access.** Use `queryDb(db, sql, params, { label, timeoutMs, retryOnReconnect })` and always give a descriptive `label`. Background jobs use `retryOnReconnect: false`.
- **Migrations.** Use the existing marker pattern in `server/plugins/db-init.ts` (`setAppSetting(db, '__<name>_v1', …)`). Run heavy migrations in `runDeferredBackfills` so they don't block boot.
- **Cron.** Reuse the `node-cron` loading pattern from `server/plugins/download-cleanup.ts` (`createRequire` + `normalize…Cron`). Extract it into a shared helper `server/utils/cron.ts` when it is first needed (LOG-1.4).
- **Never log secrets.** Everything sent to any sink goes through `redactDeep` with `settings.redact_fields`.
- **Time.** All file names and day buckets use **UTC**.
- **Definition of done (every task).** Code + unit tests for pure logic. `npm run lint`, `npm run typecheck`, and `npm run test:unit` all pass. `docs/logging/progress.md` updated.
