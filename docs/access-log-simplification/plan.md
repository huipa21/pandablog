# Access-log retirement: implementation plan

**Status: implementation authorized by the user; working-tree changes, not rollout-approved.** Retire the application-owned access-log system, not the other logging or analytics features. Read [progress.md](./progress.md) before implementation; record execution evidence there. Source baseline: `d1b2f79`; recheck current code before editing.

## 1. Target and boundaries

The reverse proxy owns new HTTP access logs. PandaBlog retains only lightweight request correlation for application errors and administrative activity. The application no longer writes, emits per-request access console entries, scans, counts, compresses, exports, purges or expires access history.

Remove:

- Access writer, reader, count cache, file maintenance, shutdown hooks and automatic DB-to-file migration/table removal.
- Access list/detail/hourly/export APIs and access-specific branches in generic log APIs.
- Access pages/redirects, request chart, file-storage totals, cleanup controls, filters, settings and active feature flag.

Keep unchanged except for necessary decoupling:

- Structured application/error console output, redaction, cause/size bounds, error-hook threshold and current storage/module semantics.
- Error groups, occurrences, inbox, backfill, storm guard and DB retention.
- Administrative/security activity records and DB retention.
- Analytics, browser tracking, GeoIP, post view counts and analytics publication/restore behavior.
- Authentication, CSRF/origin protections, trusted client-IP handling, public cache/privacy behavior, startup/readiness, restore fencing and shutdown drains for remaining workers.

**Non-goals:** replacing access files with DB rows/stdout access logging; a proxy-log ingestion service, admin proxy-log browser, embedded archive reader, new observability dependency, offline conversion product, new analytics counters, changes to other retention policies, live-data cleanup or deployment.

## 2. Decisions to approve before implementation

| Decision | Recommendation | Consequence |
|---|---|---|
| New access-log owner | Existing Caddy or nginx installation, not the app | Operators read proxy logs; no replacement admin Access page/chart |
| Historical files/buffers/receipts | Preserve byte-for-byte in place and in an independently verified operator archive; new app never inspects or mutates them | Disk is not automatically reclaimed; archive expiry/removal needs separate authorization |
| Legacy `access_logs` table and migration markers | Leave untouched; no automatic export, resume, marker rewrite or table removal | Old DB history remains cold data, including an unfinished migration |
| Full backups containing legacy access rows | Permit otherwise-supported full snapshots to preserve/restore the table **inertly**, only after real fixture acceptance | Narrowly replace the current access-specific refusal; do not extend unsupported non-full/unknown backup formats |
| Retired interfaces | Remove access pages/APIs and fields in one coordinated release; documented breaking admin contract | No fake zero counts, archive queries or indefinite compatibility endpoints |
| Old configuration | Accept/ignore legacy manifest `logs.accessLogs`; ignore retired persisted logging keys on read; reject retired keys in new settings PUTs | Old manifests still build; old API clients must update; saved values are omitted on the next ordinary settings save |
| Proxy coverage/retention | Explicit per-site format, persistence, rotation, sensitive-data policy and verified request-ID correlation | Existing app exclusions/sampling and 30-day retention do not automatically transfer |

The user's subsequent implementation request authorizes these recommended code/compatibility changes; see progress for evidence. It does not authorize operating on existing user data or deploying. If in-app historical browsing or automatic legacy conversion is required, revise scope: it prevents complete removal of the query/migration subsystem.

## 3. Source-confirmed inventory

| Area | Current files/behavior | Intended change |
|---|---|---|
| Request lifecycle | `server/middleware/access-logging.ts` generates UUID/context/response header, then records on response finish; excluded paths get no ID | Replace with tiny, independent request-ID handling; no finish listener |
| Stores | `server/utils/access-log-{store,reader,migration}.ts`, `bounded-log-value.ts`, `server/plugins/access-log-store.ts` | Delete after removing callers and confirming access-only use; keep historical data, not a runtime archive engine |
| Logger/admin | `server/utils/logging.ts`, `logging-admin.ts`, `logging-logic.ts`, `log-console.ts` | Remove access imports/types/branches/filter helpers; retain shared sanitization and error/activity behavior |
| Startup | `server/plugins/db-init.ts`: access export/removal and excluded-path migration | Remove those calls/functions/imports; retain settings reload, error backfill and unrelated migrations |
| Scheduled work | `server/utils/log-retention.ts`, `server/plugins/log-retention.ts`: 00:05 UTC access maintenance plus daily/boot DB retention | Remove access pass and report fields; keep existing daily/boot/run-now DB retention |
| API | `server/api/admin/logs/access.get.ts`, `access/**`, `[type].delete.ts`, `[type]/[id].get.ts`, `[type]/export.get.ts`, `cleanup.post.ts`, `stats.get.ts` | Delete static access routes; close generic escape paths before removing helpers |
| UI | `pages/admin/dashboard/logs/{access,index,settings}.vue`, `pages/admin/logs/access.vue`, `components/admin/LogDetailDialog.vue`, `layouts/admin.vue` | Remove Access/chart/file-size controls; keep activity/errors/settings/navigation useful |
| Shared UI/types | `utils/loggingAccessUi.ts`, `loggingChart.ts`, `loggingSettings.ts`, `types/logging.ts`, locales `en.json`/`zh-CN.json` | Delete access-only code/keys; retain any independently used shared helpers |
| Modules | `build/pandablog-modules.ts`, `modules/feature-flags.ts`, `utils/moduleFlags.ts`, module types/schema/defines, manifest defaults/example, `scripts/configure/index.html` | Remove active access switch; tolerate old input without publishing an active access flag; no access-based hiding of remaining Logs overview |
| Restore | `server/utils/backups/restore.ts` refuses nonempty legacy `access_logs` before destructive work | Replace this access-only restriction with tested inert preservation if approved; keep every other validation/fencing/safety/rollback check |
| Proxy | `deploy/production/caddy/{Caddyfile,conf.d/panda.caddy}`, `deploy/production/nginx/pandablog.conf` | Caddy already logs rotating JSON; make privacy/correlation explicit; nginx needs explicit site format/output/rotation instructions |
| Operations/tests | `docs/logging/`, applicable backend/backup/runtime runbooks, `Readme.md`, `scripts/log-baseline.mjs`, logging/access/module/health/restore tests | Update active contracts and test expectations; preserve historical evidence as historical |

Do not delete shared `request-abort.ts`, DB admission/deletion primitives, console sanitization, `node-cron`, or other dependencies merely because access code used them. Recheck actual callers.

## 4. Technical contracts

### 4.1 Request correlation without access logging

- Generate a fresh server-owned UUID; ignore inbound `X-Request-Id` for application identity. No new trusted-header setting or client-controlled IDs.
- Store it in `event.context.requestId` and emit `X-Request-Id`. The same request must have the same context/header/error/activity ID.
- Independent of `logs.enabled`, `accessLogs`, console mode, DB/settings readiness and file permissions. No logger import, DB/FS access, timing accumulator, queue or response-finish listener.
- Preserve the exact `/api/health` and `/api/health/` no-request-ID behavior; no broad prefix exemption. Other paths formerly excluded from access logging may now have IDs.
- Use a small helper (suggested `server/utils/request-id.ts`) and early middleware (suggested `server/middleware/request-id.ts`). Reuse the idempotent helper at the beginning of the existing outer maintenance handler if necessary: its 503 response can bypass Nitro middleware. Never change admission/diagnostic exceptions to obtain an ID.
- Ensure cached/SSR responses carry the **current** request's ID, not a cached earlier ID. Do not add request ID to cache keys or defeat caching. IDs describe actual HTTP requests, not every internal subrequest or browser pageview.
- Proxy-only redirects/denials/errors or an unreachable app may have no application ID; retain an edge ID where available. Do not promise application correlation for requests that never reach PandaBlog.

### 4.2 Proxy contract

- Log UTC timestamp, method, path, HTTP status, request duration and application response request ID. Edge ID/client IP are useful with the existing trusted-edge policy. Define any optional UA field explicitly.
- Default to path **without query string**; omit request body, credentials, authorization/cookie headers, response cookies and referrer. Configure/test Caddy filtering, not just JSON formatting. Sensitive values in path segments remain a documented limitation.
- nginx `log_format` belongs in `http` context; provide a separate include/example if necessary. Use JSON escaping, `$uri` rather than `$request_uri`, and `$upstream_http_x_request_id` for the application ID; an edge `$request_id` is distinct, not silently substituted as an app ID.
- For Caddy, verify the installed version's supported filter/correlation syntax against real response headers. Do not claim an unvalidated example is operational evidence.
- Keep logs on the proxy's verified persistent mount/host path, outside the app container. Do not mount proxy logs into PandaBlog or expose their paths through public configuration.
- Caddy currently uses 10 MiB files, five rolled files and a 720-hour age limit. Size/count limits can shorten history: this is **not** a guarantee of 30 days. nginx persistence/rotation/reopen are proxy/operator responsibilities. Approve actual retention before cutover.
- App exclusions/status filters/sampling do not configure the edge. Document and test any deliberate health/static exclusions and edge-generated traffic. Request counts/timings will not exactly match the old chart.
- Direct local app runs continue to work without access logs. Production needs a verified edge logging policy, not new app startup/proxy-discovery machinery.

### 4.3 API/settings/module retirement

- Supported log types become `activity` and `errors`. Auth/CSRF checks remain unchanged.
- Authenticated retired access list/detail/hourly/export/purge paths return 404 with no file/DB-history operations. Generic `[type]` routes must recognize/reject retired `access` too; deleting static route files alone is insufficient. Existing unauthenticated/unauthorized requests retain normal auth behavior.
- Cleanup payload `type: 'access'` returns validation 400 before any mutation. No access purge token remains effective.
- Stats omit `access` and `access_files_bytes`; retain `activity`, `errors` and clearly labeled `db_estimate_bytes`. Never report a zero as if archived access data were counted or removed.
- New retention reports omit `deleted.access`/`deleted.access_files`. Old activity metadata is historical and must not be rewritten.
- Retire `access_log_enabled`, `retention_access_days`, `excluded_paths`, `excluded_status_codes`, `sampling_rate`, `ACCESS_LOG_DIR` and active `logs.accessLogs`/`__PB_MODULE_LOGS_ACCESS__`. Confirm access-only usage first.
- Stored legacy settings/markers remain untouched during boot. Normalize only remaining settings in memory; ordinary save/reset writes only the active settings contract. New PUTs with retired keys return 400 before writes; do not broadly accept unknown keys.
- `LOG_CONSOLE=all` and the saved console toggle still emit existing app/activity/error entries, but no per-request access entries. Remove `access_log` from the active console kind if unused.
- Old v1 manifests with either boolean `logs.accessLogs` remain accepted as deprecated no-op input. New defaults/configurator/output omit it; unrelated validation stays strict. No forced rewrite of operator files.

### 4.4 Historical data and backup compatibility

- Remove all automatic access migration/table-removal and access maintenance before any target image runs. No new retirement marker, boot archive job, automatic directory listing or receipt repair.
- Preserve day files, `.index.json`, `.migration-v1.json`, `.migrating`/`.gz.tmp` remnants, legacy buffers/`.flushing` files, unknown files and any surviving DB table/markers. A missing, unsafe, read-only or damaged access directory no longer affects startup or log stats because it is never opened.
- Archive **all existing history**, not only the old retention window or an API export capped at 10K rows. Preserve unfinished source and destination artifacts without merging/deduplicating them during retirement.
- Full DB/media backups do not include access files/buffers/proxy logs. Use separately verified quiesced copies or storage snapshots; retain an unrestricted DB backup when legacy rows exist. Verification needs a bounded inventory/checksum and restore rehearsal, not just a job success toast.
- If approved, an otherwise-supported full restore may recreate `access_logs` as inert snapshot data. Verify all-table import/export, row IDs/content, schema repair, restart and paired rollback on an isolated real DB. No access workers, marker reset or table removal may activate afterward. Do not skip snapshot validation or silently exclude legacy rows to make this pass.
- If inert restoration cannot be proved safe, retain the existing refusal and mark this compatibility decision/release gate **blocked**. Do not substitute a silent data drop, automatic conversion, or claim new full snapshots containing legacy rows are restorable.
- Retain format-version/unknown/non-full backup refusals and existing excluded-table manifest interpretation. Downgrade is a separately reviewed stopped-writer procedure using compatible snapshots, never automatic replay of proxy logs.

## 5. Tasks and dependency order

### AL-00 — Decision checkpoint and regression inventory

- **Depends on:** none. **Size:** S.
- Confirm section 2, inventory all runtime/build/UI/test consumers and legacy backup cases, and record approval in progress.
- Add owned regressions for no access-history I/O/mutations, generic retired routes, request correlation and remaining log features. Replace expectations of the removed product; do not weaken unrelated bounds/security tests.
- **Done when:** decisions are explicit; failing tests target the retirement contracts; fixture paths/secrets are isolated and new tests are tracked.

### AL-01 — Decouple request IDs and verify proxy logging

- **Depends on:** AL-00. **Size:** M.
- Implement section 4.1 independently of logging/module flags; test health, errors, activity, caches and maintenance responses.
- Update supplied Caddy/nginx examples and establish owned container/proxy tests for section 4.2, including privacy, correlation, rotation/reopen and unavailable app.
- **Done when:** request correlation no longer requires access middleware; examples validate and actual edge logs match the agreed format. Missing proxy runtime evidence is recorded as blocked, not inferred from config inspection.

### AL-02 — Retire runtime storage, queries and historical mutations

- **Depends on:** AL-01. **Size:** M.
- Close static/generic access routes and cleanup payloads; remove `logAccess`, writer/reader/migration and plugin callers.
- Remove access boot migrations, excluded-path migration and 00:05 schedule; keep remaining daily/boot/manual retention and shutdown behavior.
- Simplify stats, retention reports, generic log helpers and shared types. Prove old files/table/markers stay untouched across requests, stats, saves, retention, restarts and shutdown.
- **Done when:** sections 4.3/4.4 preservation tests pass; no active access store/query/migration imports or finish listeners remain. Intermediate branches are not deployment-ready.

### AL-03 — Integrate UI, modules and full-backup preservation

- **Depends on:** AL-02. **Size:** M.
- Remove Access pages/redirects/nav/chart/settings/locales; keep remaining Logs dashboard with useful module combinations and current auth forwarding.
- Remove the active access flag/define/configurator field; add narrowly scoped old-manifest compatibility. Update settings client/API together.
- If approved, replace only the obsolete access-specific full-restore guard and exercise inert table preservation/paired rollback; keep analytics/error/history repair unchanged.
- **Done when:** active interfaces agree, en/zh-CN and full/minimal/module profiles work, full-backup legacy compatibility is proved, and no live history is modified by feature retirement.

### AL-04 — Combined verification, documentation and handoff

- **Depends on:** AL-03. **Size:** M, runtime-dependent.
- Run the [acceptance matrix](./acceptance-test.md), full quality checks, guarded DB, owned production Nitro/browser/module and Linux proxy tests.
- Update active logging/backend/backup/runtime runbooks, README, route matrix and applicable release requirements. Preserve old specs/results as historical, with narrow retirement cross-links; do not rewrite old passes or waive unrelated gates.
- Adapt/remove access-only baseline tooling and tests once their replacement preservation/correlation tests pass. Check remaining runtime imports/route manifest/bundle rather than relying solely on grep or unit mocks.
- Finalize [operations.md](./operations.md), compatibility release notes and progress with exact evidence/gaps. Planning and local tests do not authorize operations on the user's deployment.
- **Done when:** required local evidence passes, blockers are truthful, and a separately approved operator cutover can follow the runbook without app-owned access code.

## 6. Verification practice and scope controls

Use [backend harness](../backend-hardening/harness.md), [verification spec](../backend-hardening/specs/09-verification.md), current [logging operations](../logging/operations.md), [backup operations](../backup-simplification/operations.md), and [maintenance restore contract](../maintenance-simplification/specs/02-jobs-and-restore.md). This proposal supersedes only access-specific behavior after approval/implementation; it is not permission to relax unrelated release gates.

Code tasks require targeted regressions plus `npm run lint`, `npm run typecheck`, `npm run test:unit` and `git diff --check`. Use supported Node 22; changed backup/import/restore semantics require the guarded stable SurrealDB 3.2.x fixture. Production build/browser runs must use an owned source/environment without the user's `.env` or `storage/`. Read `playwright.config.ts` before using default e2e commands; existing server reuse is not isolation.

No configured DB, user storage, receipts, credentials, proxy/container or live history may be changed by this planning request. Do not commit/push/deploy. Preserve unrelated dirty work. Missing test infrastructure is a recorded blocker, not a reason to bypass preservation or keep the retired subsystem under a new name.

Effort estimate: **3–5 engineering days** including integration/documentation, conditional on available isolated DB/proxy/build fixtures and approved legacy policy. Primary benefit is reduced maintenance surface; do not promise a measured CPU/RSS/latency improvement without measurements.
