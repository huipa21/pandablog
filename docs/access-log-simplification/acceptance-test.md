# Access-log retirement: acceptance matrix

**Status: working-tree retirement implemented and locally exercised.** Exact results and limitations are in [progress.md](./progress.md); this matrix remains the required contract, not a blanket pass or deployment approval. Default-concurrency unit timing failures and combined/deployed HTTPS/proxy/operator archival gates remain outstanding.

## Evidence summary (not a release waiver)

- A/C: new H3/helper/API and retained log regressions pass; all seven production module profiles passed owned typecheck/build/en+zh-CN browser and boot/crash/history checks. Actual cached Nitro/SSR IDs and applicable error DB IDs passed.
- B: Linux Caddy 2.10.2/nginx 1.28.0 log snippets validated with a **synthetic upstream**, privacy sentinels, 200/500/edge 403/502/504, persistent volume stop/start, Caddy rotation and nginx reopen. Full app-behind-HTTPS, hostile-input/deployed site, recreation and age/count policies remain combined/operator gates; do not label all B rows complete.
- D: owned artifact/settings preservation, actual app restart and guarded full/empty/legacy/imported full restore/paired rollback preserve legacy rows/markers/receipts. D7 approved-copy archive/restore/downgrade has not been executed.
- E: final lint/style, bounded full suite (1,112 passed), guarded DB (24 passed), emitted-server inventory and docs/source checks pass. Default full concurrency still exposes existing timing-sensitive media-abort/annotation tests; no assertion/timeout weakened. External acceptance is not supplied by these checks.

## A. Request correlation (AL-01)

| ID | Required proof | Evidence |
|---|---|---|
| A1 | One server-generated UUID per ordinary request; response header, event context, explicit/hook error and activity record agree | Helper/unit plus actual H3/Nitro requests |
| A2 | Absent, spoofed, malformed, oversized and duplicate inbound request-ID headers cannot select the application's ID | Actual HTTP cases; no header reflection |
| A3 | Correlation works with logs disabled, errors/activity individually disabled, each console mode, settings unavailable and DB disconnected | Units plus production/module profiles; do not change current error-module semantics |
| A4 | Exact health routes retain no request-ID behavior and DB-free/private/restore diagnostics; similarly named routes are not exempt | Adapt `health-http.test.ts`; current CLI regressions |
| A5 | Maintenance/startup 503 paths that bypass middleware still carry an ID when applicable, without weakening fencing or querying the DB | Outer-handler plus production Nitro cases |
| A6 | Repeated cached public/SSR responses and concurrent requests have current, distinct response IDs; errors use current context; no new cache-key variation | Actual production Nitro/cache requests |
| A7 | No timing collector, response-finish logger, access queue, logger import or access-history FS/DB work in request-ID handling | Source/bundle inventory and instrumented requests |

Internal SSR/local fetches need not share one browser-request ID unless the existing transport actually does so. Test real requests; do not invent tracing propagation in this task.

## B. Edge access logs (AL-01, AL-04)

| ID | Required proof | Evidence |
|---|---|---|
| B1 | Caddy and nginx examples validate against explicitly recorded supported proxy versions; nginx format is in valid `http` context | Owned proxy binaries/containers, configuration validation |
| B2 | Ordinary 2xx/4xx/app 5xx responses log method/path/status/time and the same application ID clients/errors observe | Proxy + production Nitro traffic, inspect actual JSON |
| B3 | Edge-only redirects/denials/502s are logged; no fabricated app ID; edge ID clearly distinguished where supported | Proxy-only/unavailable-upstream requests |
| B4 | Query secrets, auth/cookie/response-cookie values, bodies and referrers are absent; quotes/control characters produce valid JSON | Seeded sentinel/hostile-header requests; both proxy examples |
| B5 | Logs persist through proxy restart/recreation, rotate within agreed size/count/age bounds, and nginx reopens safely after rotation | Owned Linux/container mount + rotation/reopen rehearsal |
| B6 | Proxy IP handling/rate-limit inputs remain spoof-resistant; configured health/static exclusions and coverage differences are explicit | Existing security regressions plus edge traffic |
| B7 | No proxy-log mount, proxy-log ingestion endpoint or proxy credentials added to PandaBlog | Compose/config/source inventory |

Current Caddy size/count limits are not a 30-day guarantee. Passing B5 verifies the agreed policy, not exact equivalence with old application retention. Do not flood the real proxy to test rotation.

## C. Removed runtime/API/UI contracts (AL-02, AL-03)

| ID | Required proof | Evidence |
|---|---|---|
| C1 | Access writer/reader/migration/plugin and static routes absent; no request access console entries in effective `all`; no access-specific 00:05 schedule | Runtime imports/built route manifest, instrumented requests and scheduler tests |
| C2 | Authenticated GET list/detail/hourly/export and DELETE purge cannot reach files/history through static **or generic** routes; retired paths return 404 | Real H3/Nitro HTTP cases, including `/access`, `/access/:id`, `/access/hourly`, `/access/export` |
| C3 | Access cleanup is rejected with 400 before mutation; old purge token is ineffective; retained generic routes keep auth/CSRF rules | HTTP mutation/unauthorized/cross-origin cases |
| C4 | Stats/report DTOs omit access/file fields, never scan old directories, and keep accurate remaining fields/DB estimate labeling | Stats/retention API fixtures and UI assertions |
| C5 | Legacy saved settings normalize safely without boot rewrite; active save/reset omits retired fields; retired/unknown PUT keys fail before writes | Actual settings helper/API tests |
| C6 | Old manifests with `accessLogs: true`/`false` build as deprecated no-op input; new configurator/output omit flag; unrelated invalid manifests still fail | Module-loader/schema/configurator tests and owned builds |
| C7 | Access pages/aliases/nav/chart/file-storage controls gone; activity/errors/settings and breadcrumbs work in en/zh-CN with no calls to retired APIs | Owned production browser/network checks; shared detail-dialog tests |
| C8 | Full, logs-disabled, activity-only, errors-only, analytics-disabled and backups-disabled profiles work; request IDs remain independent | Owned module profiles, actual build/boot/smoke; existing manifests are not rewritten |
| C9 | Error grouping/backfill/inbox, activity capture, remaining retention/circuit-breaker, analytics/post counts, privacy/cache and restore admission retain their contracts | Targeted existing suites plus full local quality |

Removing static routes must not leave `[type]/[id]`, `[type]/export` or `[type].delete` as an access backdoor. Authorization expectations apply where normal generic handlers match; do not add an auth-only retired-route framework merely to obscure a missing route.

## D. History and backup preservation (AL-02, AL-03)

| ID | Required proof | Evidence |
|---|---|---|
| D1 | Day files, plain/gzip duplicates, corrupt/partial lines/gzip, cache, receipts, temp remnants, legacy buffers, unknown files and symlinks are unchanged after requests/stats/settings/retention/restart/shutdown | Owned sentinel directory inventory/hashes; no access-history open/list/write/delete calls |
| D2 | Missing/read-only/damaged access directories, stale `ACCESS_LOG_DIR`, and mismatched/unfinished receipts do not trigger access boot failure or attempted repair | Owned startup fixtures; no access directory creation/scan |
| D3 | Nonempty/empty/missing legacy table and absent/partial/completed/mismatched migration markers remain untouched, including restored-table combinations | Instrumented startup plus isolated real DB comparison |
| D4 | Supported full backup export/import/restore retains legacy row IDs/content and table; schema/runtime repair/restart leave it inert; marker settings do not resume migration | Guarded real DB with actual full worker and independent record verification |
| D5 | Forced full-restore failure preserves verified paired DB/media rollback, including legacy rows; uncertainty/fencing behavior unchanged | Existing real worker failure fixture extended with cold history |
| D6 | Access files/buffers/proxy logs remain outside DB/media bundle; no silent table exclusion, repack/conversion or resurrected `include_access_logs`; unsupported non-full/unknown backups still refused | Backup unit/manifest/real fixture checks |
| D7 | Operator rehearsal archives all existing bytes/rows (not the old retention subset or 10K API export), verifies inventories/hashes and restores a copy; rollback retains post-cutover history | Separately approved production-copy/operator evidence; not mandatory live operation for local code completion |

D4 is required before changing the existing access-specific full-restore refusal. If it cannot pass, preserve the refusal, document affected legacy/new full backups and mark the compatibility/release gate blocked. Never pass D4 by stripping rows or bypassing snapshot validation.

## E. Combined quality and handoff (AL-04)

- Supported Node 22: targeted regressions, lint, typecheck, full unit execution and `git diff --check`; exact versions/results and unrelated baseline failures recorded.
- Stable SurrealDB 3.2.x: approved [guarded fixture](../backend-hardening/harness.md), actual backup/import/restore/restart/rollback preservation. Mocked SQL alone is insufficient.
- Owned production Nitro/browser/module and Linux/proxy evidence for A/B/C; isolated copies omit the user's `.env`, storage and inherited credentials. Missing mandatory environments are blocked, not passes.
- Active docs/release requirements agree on removed access APIs/fields/console entries and retained history. Old logging/backend evidence remains historical; unrelated gates are not waived.
- Runtime reference search and built output show no access store/reader/migration engine. Legacy names may remain only in deprecated-input handling, preservation tests, inert snapshot metadata and historical/draft docs.
- No new archive engine, retirement marker, telemetry dependency or proxy-log backend. Report removed complexity rather than asserting unmeasured performance gains.

Local proxy rotation/reopen on Linux does not supply the complete deployed/recreation/retention B5 contract, D7 on an approved production copy, or operator deployment/overnight evidence. Do not label all gates passed based on the unit suite.
