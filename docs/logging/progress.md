# Logging redesign: progress

> Read this first in every session. The plan is in [`plan.md`](./plan.md) and the specs are in [`specs/`](./specs/).
> Update this file at the end of every task: the status table, a session log entry, and decisions.

## Current state

- **Next task:** `LOG-2.1` (Access log file writer)
- **Phase 1:** local verification complete; production rollout, 600K-scale, Docker, overnight, and 24-hour acceptance remain pending below.
- **Active branch:** `main`
- **Blockers:** none

## Task status

| ID | Title | Status | Date | Notes |
|---|---|---|---|---|
| LOG-0.1 | Measure the current state (operator) | done | 2026-10-04 | Oldest timestamp not captured (see Baseline) |
| LOG-1.1 | Structured console sink | done | 2026-10-04 | Console routing/formatting verified by unit tests; production checks pending |
| LOG-1.2 | Error capture: status, 4xx filter, cause | done | 2026-10-04 | Status/filter/cause/flags/settings verified by unit tests; production checks pending |
| LOG-1.3 | Batched log deletion helpers | done | 2026-10-04 | Unit tests and isolated SurrealDB 3.2.4 checks pass; production-scale/UI checks pending |
| LOG-1.4 | Scheduled retention job + admin trigger | done | 2026-10-04 | Runner/cron/API tests and isolated live pass succeed; deployment/UI/production backlog checks pending |
| LOG-1.5 | `/api/health` + `panda health` URL | done | 2026-10-04 | Handler/middleware HTTP/CLI tests pass; deployed latency/Docker/24h-volume checks pending |
| LOG-1.6 | Default excluded paths + merge migration | done | 2026-10-04 | Defaults/merge/boot/cache/reset/routing tests pass; deployment/UI/volume checks pending |
| LOG-1.7 | Access logs out of backups (optional) | done | 2026-10-04 | Selection/settings/worker/schema tests and isolated live export/restore pass; deployed UI/traffic/size checks pending |
| LOG-1.8 | Docker log rotation + env docs | done | 2026-10-04 | Compose/env validation and all checks pass; deployed rotation/env checks pending |
| LOG-1.9 | Phase 1 verification | done | 2026-10-05 | Full checks + isolated real dev HTTP/UI/DB/backup/restore checks pass; production/600K/Docker/24h gates pending |
| LOG-2.1 | Access log file writer | todo | | |
| LOG-2.2 | Gzip + file retention | todo | | |
| LOG-2.3 | Access log reader / query engine | todo | | |
| LOG-2.4 | Rewire admin APIs to file store | todo | | |
| LOG-2.5 | Hourly endpoint + dashboard chart | todo | | |
| LOG-2.6 | Admin UI adjustments | todo | | |
| LOG-2.7 | Migrate `access_logs` → files, drop table | todo | | High risk: test on a prod copy |
| LOG-2.8 | Phase 2 verification | todo | | |
| LOG-3.1 | Error fingerprint function | todo | | |
| LOG-3.2 | Schema: `error_groups` | todo | | |
| LOG-3.3 | Grouped write path + rate guard | todo | | |
| LOG-3.4 | Backfill groups | todo | | |
| LOG-3.5 | Error group APIs | todo | | |
| LOG-3.6 | Grouped errors inbox UI | todo | | |
| LOG-3.7 | Group retention + occurrence cap | todo | | |
| LOG-3.8 | Phase 3 verification | todo | | |
| LOG-4.1 | Dead code / settings cleanup | todo | | |
| LOG-4.2 | Operator documentation | todo | | |
| LOG-4.3 | Final review | todo | | |

Status values: `todo` · `in-progress` · `blocked` · `done` · `skipped`

## Baseline (LOG-0.1)

_Fill in from spec 03 §2 queries. Re-measure after each phase deployment._

| Metric | Baseline | After P1 | After P2 | After P3 |
|---|---|---|---|---|
| `access_logs` rows | **635,189** (dashboard said ~629K) | | n/a | n/a |
| `access_logs` oldest timestamp | not captured (aggregate returned `inf`/`-inf`). Estimated ~32 days from the healthcheck rate | | | |
| Share of rows from healthcheck (`127.0.0.1`, `/`) | **14.5%** (91,871 rows) | | | |
| `error_logs` rows | **1,409** (all from `nitro.error_hook`) | | | |
| `activity_logs` rows | 8 | | | |
| `error_groups` rows | n/a | n/a | | |
| Dashboard "DB estimate" | ~422 MB | | | |
| SurrealDB data volume (`du -sh`) | 210 MB (`~/container/pandablog/surreal_data`) | | | |
| Latest full backup size | 32.9 MB DB (`…db.surql.gz`) + 1.9 MB media = ~34.7 MB (backup `2026100323325284db28`) | | | |
| Access files (`du -sh app-storage/logs/access`) | n/a | n/a | | |
| `docker logs` lines / day | 22 lines in 10 h (~53/day) | | | |

Queries are in spec 03 §2. They were run by the operator in Surrealist against production. `scripts/log-baseline.mjs` does the same read-only from a machine that can reach the DB.

**Host measurements, 2026-10-04 (operator):**
- `sudo du -sh` in `~/container/pandablog/surreal_data` → **210 MB**. An earlier 4.1 GB reading was the whole home dir and is ignored. Note that the dashboard's "DB estimate" said ~422 MB, about 2× the on-disk size, so compare like with like after each phase.
- `docker logs pandablog-app 2>&1 | wc -l` → 22 lines. The container has been up 10 h (`Up 10 hours (healthy)`), so the rate is ~53 lines/day. This confirms that almost nothing reaches stdout today (spec 00 §1 item 5). Images: app `localhost/pandablog:alpine`, DB `surrealdb/surrealdb:v3.2`.
- Latest full backup: `2026100323325284db28-db.surql.gz` is 32.866 MB, and `…-media.tar.gz` is 1.875 MB.

**Dev DB snapshot, 2026-10-04** (`.env` → `surreal.zenseek.site`, ns/db `test`). Not the production baseline. Kept only as a reference.

| Metric | Dev value |
|---|---|
| `access_logs` rows | 54 |
| `access_logs` oldest/newest | null (the `timestamp` aggregate returned null) |
| Healthcheck rows (`127.0.0.1`, `/`) | 0 |
| `error_logs` rows | 1 (`Post not found`, `nitro.error_hook`) |
| `activity_logs` rows | 1 |
| Status codes | 200: 49, 204: 4, 304: 1 |

**Production results, 2026-10-04 (operator, Surrealist).** Query times were 0.2–1.5 s for the `access_logs` aggregates.

Top IPs:

| IP | Rows | Share |
|---|---|---|
| NONE (no IP stored) | 533,731 | 84.0% |
| 127.0.0.1 (healthcheck) | 91,871 | 14.5% |
| 119.109.45.52 | 2,091 | |
| 35.240.58.49 | 1,038 | |
| 35.237.14.41 | 1,031 | |
| 45.138.12.23 | 1,030 | |
| 34.156.206.32 | 878 | |

Top paths (20 shown):

| Path | Rows | Share |
|---|---|---|
| `/api/site/bootstrap` | 227,766 | 35.9% |
| `/` | 92,064 | 14.5% |
| `/api/posts` | 75,968 | 12.0% |
| `/api/posts/publish-frequency` | 75,901 | 11.9% |
| `/api/_auth/session` | 62,717 | 9.9% |
| `/_i18n/*/en/messages.json` (3 hashes) | 78,666 | 12.4% |
| `/api/graph/overview` | 15,885 | 2.5% |
| `/__nuxt_error` | 1,210 | 0.2% |
| `/api/admin/posts/<id>/lock` (several) | ~1,266 | 0.2% |

Status codes: 200: 633,487 · 404: 1,392 · 304: 139 · 204: 131 · 302: 21 · 401: 9 · 400: 6 · 202: 3 · 500: 1.

User agents: NONE 625,610 (98.5%). The rest are real browsers (top: Chrome 131 / Firefox 154 with 1–4K each) and `Go-http-client/1.1` (114).

Error logs: 1,409 rows, **all** from `nitro.error_hook`. Top messages are bot scans, `Page not found: /.env`, `/.git/config`, `/.env.*`, `/config.json`, `/info.php`, `/phpinfo.php` (7–23 each), plus `Unauthorized` (8). The 4xx filter in LOG-1.2 should remove nearly all of them.

### Findings that affect later tasks

1. **Healthcheck is 14.5% of rows**, as expected. 91,871 / 2,880 per day ≈ 32 days of history. LOG-1.5 and LOG-1.6 address it.
2. **84% of rows have no `ip` and 98.5% have no `user_agent`.** They are SSR-internal sub-requests (`/api/site/bootstrap`, `/api/posts`, `/api/posts/publish-frequency`, `/api/_auth/session`, `/api/graph/overview`, `/_i18n/*`), not real visitors. This is the **bulk of the volume and is not in the spec's default excluded-paths list**. Two options for LOG-1.6, to be decided there: (a) add `/_i18n` (~12%) to the defaults, and/or (b) skip access logging for internal requests that have no IP and no user agent (~84%). Option (b) removes most of the volume at once, but the exact detection must be verified first (for example, a `localFetch` request has no `x-forwarded-for` or socket address).
3. The `/api/admin/posts/<id>/lock` paths are a small steady stream (admin heartbeat), not worth excluding.
4. **Error noise is almost all 404 scanner traffic.** This confirms the LOG-1.2 `error_log_min_status` default of 500.
5. `MIN/MAX(timestamp)` returned `inf`/`-inf`, so `math::min`/`math::max` over datetimes does not work on this DB (SurrealDB v3.2). Use `ORDER BY timestamp … LIMIT 1` in later queries (spec 03 §2 and any retention code that relies on min/max). Optional follow-up: record the oldest row with `SELECT timestamp FROM access_logs ORDER BY timestamp ASC LIMIT 1;`.

## Decisions / deviations

_Record any deviation from a spec, with the reason and task id._

- 2026-10-04 · LOG-0.1: added `scripts/log-baseline.mjs` (read-only) although the plan says "no code". It makes the baseline repeatable for the "After P1/P2/P3" columns.
- 2026-10-04 · LOG-0.1: `math::min`/`math::max` on datetimes returned `inf`/`-inf` on SurrealDB v3.2, so the oldest timestamp was not captured. See finding 5 in Baseline.
- 2026-10-04 · Design approved: access logs → files, errors → grouped DB + stdout, activity → DB. See spec 00.
- 2026-10-04 · LOG-1.1: reuse the sink's safe context normalization for stored metadata as well, because the previous recursive `redactDeep` could throw on circular data before the console sink ran. Cycles become `[Circular]`, BigInt becomes a string, and record IDs use their JSON representation. Storage switches remain independent of console output; existing access exclusions/sampling still apply to both sinks.
- 2026-10-04 · LOG-1.1: the 16 KB cap includes the newline. After stack/context truncation, exceptionally large message/path/UA/cause strings are shortened too, so every emitted entry stays within the byte cap. Cause chains are console-only here; stored causes and status filtering remain LOG-1.2.
- 2026-10-04 · LOG-1.2: valid HTTP statuses follow the specified `statusCode` → `status` → response status → 500 precedence. Malformed/non-integer/out-of-range statuses or throwing getters fall back to 500, avoiding invalid `option<int>` DB writes or accidentally suppressing an error. `source: 'nitro.error_hook'` identifies automatic capture; ordinary explicit application logs are never threshold-filtered.
- 2026-10-04 · LOG-1.2: extracted one shared three-level cause summarizer for console and persisted context. Only true H3 `unhandled`/`fatal` flags are added; intentional errors are not marked as crashes. Missing or invalid stored threshold settings normalize to 500 without a separate migration, and the new status schema field is optional for existing rows.
- 2026-10-04 · LOG-1.3: corrected the spec's inherited keep-latest off-by-one: the cutoff lookup uses offset `keep - 1`, not `keep`, so distinct timestamps retain N rather than N+1 rows. The strict cutoff conservatively retains all rows tied with the Nth timestamp. `keep = 0` delegates to purge; the existing admin API still requires keep >= 1.
- 2026-10-04 · LOG-1.3: live testing on isolated SurrealDB 3.2.4 reproduced incorrect indexed datetime ordering (four distinct timestamps sorted DESC with the lowest first, producing the wrong cutoff and over-deleting). The keep-latest cutoff lookup therefore uses `WITH NOINDEX`; batch deletion still uses the spec's bounded ID-selection query. A production-scale cutoff-sort check remains pending.
- 2026-10-04 · LOG-1.3: `DELETE $ids RETURN NONE` works on SurrealDB 3.2.4; SDK results are `[undefined, [], count]`. No fallback is needed. Helpers allow only the four specified log tables and the literal fields `timestamp`/`last_seen`, defaulting error groups to `last_seen`. Purge counts first for an empty-table fast path, then reports the summed successful batch counts rather than the initial snapshot.
- 2026-10-04 · LOG-1.4: the runner flushes buffered access rows before deleting access records, extending the manual-cleanup safety rule until Phase 2 replaces the buffer. A failed flush is reported for access but does not stop the other streams. Settings are initialized and snapshotted for each run; module/category/master enable switches determine which streams are trimmed.
- 2026-10-04 · LOG-1.4: `runLogRetention` returns the exact shared promise via a non-async public wrapper (an async wrapper would produce a different promise). Last reports are copied in/out of the in-memory cache. The runner loads logging helpers lazily to avoid an eager dependency cycle with `logging.ts`'s deletion-helper imports.
- 2026-10-04 · LOG-1.4: the five-minute boot pass remains active if node-cron cannot load, validate, or schedule; cron failures are logged through the sink and close still clears the timeout. The cron loader retains download cleanup's production-relative `createRequire` resolution, CJS/default-export support, diagnostics, and existing 30-minute cleanup behavior. Error-group and file retention remain future LOG-3.7/LOG-2.2 work.
- 2026-10-04 · LOG-1.5: the optional `db=1` probe has a two-second overall response deadline in addition to the query timeout, since `useDb()` connection/authentication can otherwise take longer. It does not cancel or close a shared pooled connection; late promise failures are handled. The public failure body is only `{ ok: false, db: 'down' }`, with no exception/build details.
- 2026-10-04 · LOG-1.5: a shared exact health-path check (canonical path, trailing slash, optional query) is enforced both in `shouldRecordAccessLog` and in `shouldExcludePath`, so the middleware skips request-ID/finish-callback work and explicit access entries cannot reach either sink. Similarly named unrelated routes remain logged/protected. No stored exclusions/defaults were changed; merging the extended defaults remains LOG-1.6.
- 2026-10-04 · LOG-1.5: site visibility already allow-lists health and the origin gate already allows GET/HEAD, so those middleware files needed no changes. Restore maintenance now allow-lists the exact health path. The endpoint is process liveness, not restore-completion/schema readiness; only the explicit DB option checks connectivity.

- 2026-10-04 · LOG-1.6: route verification found no robots/sitemap handler, static file, or generating module, so `/robots.txt` and `/sitemap` are omitted as spec 03 requires (middleware allowlists alone do not create routes). Kept `/_ipx` (`@nuxt/image`), `/__nuxt_error` (Nuxt Nitro handler), analytics tracking, and existing asset/log/health paths. Added `/_i18n`, served by `@nuxtjs/i18n`, because locale assets account for 12.4% of the production baseline and carry no visitor-level operational value. Broader no-IP/no-UA filtering is deferred: those fields alone are not a verified internal-request signal, and normal API traffic must remain observable.
- 2026-10-04 · LOG-1.6: added `utils/loggingSettings.ts` to share the exclusion list between server defaults and the admin form fallback, avoiding reset/default drift. The boot migration writes via the privileged connection before marking success, preserves other stored fields (including unknown future fields), and reloads the settings cache even if another plugin initialized it earlier. Subsequent boots only check the marker; they do not re-add defaults an admin later removes. Invalid non-string array elements are discarded, but string prefixes are preserved exactly.

- 2026-10-04 · LOG-1.7: implement the optional interim exclusion as requested rather than waiting for Phase 2. Full/incremental snapshots exclude only access logs by default; partial selection and unrestricted pre-restore safety dumps remain unchanged. `included_tables` stays null for full/incremental records. Generated manifests carry actual `excluded_tables` (empty when nothing was excluded); external imports preserve that optional metadata. There is no dedicated backup-details UI, so no manifest-details UI was added.
- 2026-10-04 · LOG-1.7: extracted module-filtered schema loading/hashing/application into `server/utils/schema.ts`. Restore invalidates `__schema_hash` and unconditionally applies the current schema immediately after verification using a short-lived ROOT client; this also handles older and partial dumps without relying on manifest metadata. The hash is left absent so the next boot performs its normal schema pass. A schema failure enters the existing safety rollback path.
- 2026-10-04 · LOG-1.7: fixed two adjacent correctness issues required for the exclusion to be safe: explicit `tables: []` no longer becomes `tables: true`, and `queryDb` now recognizes dedicated ROOT clients so an already-connected runtime pool cannot hijack privileged schema work or retry it as EDITOR. Existing stale-runtime-client rerouting/reconnect behavior remains covered by regression tests. The latter bug was discovered while tracing restore's privileged connection; the isolated live check explicitly initializes an EDITOR pool before schema repair.

- 2026-10-05 · LOG-1.9: fixed three pre-existing defects that directly blocked Phase 1 acceptance: blank excluded-status text became `[0]` and rejected settings saves; SSR `$fetch` omitted the admin session, so settings/last-report loads failed and defaults were displayed after reload; H3 routed DELETE through a static GET match without `type`, rejecting valid purge requests. Added a tested pure status parser, reused `useSessionFetch`, and added a strict allowlisted pathname fallback after authorization for purge, with real H3 HTTP regression tests. No broader logging API/UI redesign was made.
- 2026-10-05 · LOG-1.9: the 600K fixture attempt exhausted the disposable Podman memory DB during its first 10,000-row seed INSERT (`OOMKilled=true`, exit 137), **before retention ran**. Repeated retention with 6,005 rows seeded in 100-row chunks. This is not evidence of a retention OOM or a 600K pass; persistent production-scale and disk-compaction checks remain operator gates.
- 2026-10-05 · LOG-1.9: Nuxt dev forwards worker stderr through its parent stdout and adds its own human-readable request-error diagnostics. Verified exactly one subsystem JSON error entry in merged dev captures; unit tests verify stream routing. Production stderr/Docker output is still pending, not inferred from the dev wrapper.
- 2026-10-05 · LOG-1.9: spec 04's plain `grep 'access_logs:'` also matches the exported setting `include_access_logs: false`. Used a word-boundary record-ID check and schema/row inspection to verify exclusions; the operator command below avoids that substring false positive. Full runbook work remains LOG-4.2.
- 2026-10-05 · LOG-1.9: no purge control exists in the current UI, so exercised real browser age/keep-latest cleanup plus authenticated DELETE purge instead. An unrelated existing empty-media archive failure (`tar.c(..., [])` → `no paths specified to add to archive`) was recorded for follow-up rather than changing `tarStream.ts`; successful worker checks used synthetic media, including a new media file for the incremental snapshot. Restore-status polling can briefly return 500/503 while the DB is wiped/imported; waited for completion and verified the restored schema/data instead of treating one transient status as the final result.

## Pending manual verification

_Things the agent could not verify (production deploy, Docker, real traffic). Remove items once confirmed._

- LOG-0.1 (optional): run `SELECT timestamp FROM access_logs ORDER BY timestamp ASC LIMIT 1;` on production and fill in the oldest timestamp.
- LOG-1.1: after rebuilding/deploying, verify a thrown API error with `NODE_ENV=production` and default logging env prints exactly one JSON `error_log` line to stderr with `err.stack` and `request_id`, even with DB error storage disabled/unavailable.
- LOG-1.1: verify `LOG_CONSOLE=all` prints one access line for each non-excluded, sampled request; `LOG_CONSOLE=off` suppresses all subsystem output even with the admin toggle on; and toggling `console_output` upgrades `errors` to `all` without a restart. Unit coverage passes for these cases, but real Docker traffic is not yet checked.
- LOG-1.2: after rebuilding/deploying (the normal schema initializer adds optional `error_logs.status_code`), verify a 404 page and 401 API call create no new error rows or console error entries with the default threshold of 500. Access entries in `LOG_CONSOLE=all` are unaffected.
- LOG-1.2: verify a thrown 5xx API error emits one JSON error line with status/stack/request ID and stores the status plus a maximum three-level, stack-free `context.cause`. Confirm true H3 crash flags are included and intentional errors are not marked as crashes.
- LOG-1.2: verify the Errors setting in both locales, save/reload/reset (default 500), and live threshold changes without a restart. Setting 400 should allow hook 401/404 errors; explicit application `logError()` calls should remain captured regardless of the threshold.
- LOG-1.3: on a production DB copy (then during the operator's approved cleanup), verify the ~600K-row age cleanup completes without query timeouts or memory spikes, expired access rows reach zero, and before/after counts and disk size are recorded. Only a 6,005-expired-row live fixture and a simulated 600K-row unit case were run here; disk compaction may delay physical size changes.
- LOG-1.3: verify manual age cleanup, keep-latest, and purge through the admin UI with buffered access rows, including reported counts. Check the `WITH NOINDEX` keep-latest cutoff lookup at production scale; timestamp ties are intentionally preserved, so more than N rows can remain at a tied boundary.
- LOG-1.4: **before deploying**, take an appropriate backup/test on a production DB copy and record counts/disk size. The new job automatically trims enabled streams five minutes after boot, so the first production run will delete the historical backlog. Record its report, remaining expired-row count, elapsed time, and before/after counts/disk size; storage compaction may delay disk reclamation.
- LOG-1.4: verify daily execution at 03:17 server time (UTC in the container), the five-minute deferred boot pass, module/setting gates, and shutdown timer/task cleanup in the deployed Nitro build. Unit fake-timer tests and real node-cron loading/scheduling/stop checks pass; an actual overnight/deployed run was not performed.
- LOG-1.4: verify GET `/api/admin/logs/retention` and POST `/api/admin/logs/retention/run` through real HTTP routing/auth, including denied non-superadmin requests and overlapping triggers. In both admin locales, check Last run/Run now, saved-settings semantics, loading/failure/partial-report presentation, and report reset after restart. Do not run this verification against production until the operator approves the resulting deletions.
- LOG-1.5: after rebuilding/deploying, verify `curl -i localhost:3000/api/health` returns 200 with `Cache-Control: no-store` in <20 ms and writes no access entry, including private/restore mode. Check optional `?db=1` success/failure/timeout against the deployed DB, without treating it as schema/restore readiness. Local H3 HTTP tests use mocked DB/site/auth/job dependencies; no full Nitro deployment latency check was performed.
- LOG-1.5: verify `docker inspect --format '{{.State.Health.Status}}' pandablog-app` is `healthy` and the healthcheck now targets `/api/health`. Compose already invokes `panda health`, so it needs no update and old image/compose combinations remain compatible under the existing non-5xx rule. The lightweight URL requires the rebuilt image.
- LOG-1.5: after 24 h, rerun the LOG-0.1 measurements and confirm the healthcheck-related `/` requests drop by about 2,880/day. Do not attribute other traffic/retention changes to this endpoint alone.

- LOG-1.6: on a backed-up production DB copy, boot the rebuilt app with customized logging settings and verify `app_settings` contains the ordered union plus `__logging_excluded_paths_v2`, with unrelated settings unchanged. Reboot after removing a removable default in the admin UI and verify it stays removed; `/api/health` remains hard-excluded. Unit boot tests mock DB queries; no live migration against an application DB was run here.
- LOG-1.6: in both admin locales, verify load/save/reset shows the extended exclusions and reset restores them. With `LOG_CONSOLE=all`, check analytics/IPX/Nuxt-error/i18n requests reach neither console access entries nor access storage, while normal page/API traffic is still logged. After 24 h, rerun baseline queries and record the additional locale-asset reduction separately from healthcheck and retention changes; existing LOG-1.5 latency/Docker acceptance checks remain pending above.

- LOG-1.7: after rebuilding/deploying, create a full and incremental backup with the checkbox off, confirm `zcat db.surql.gz | grep -c 'access_logs:'` reports 0, and compare DB gzip sizes to an opt-in backup of the same dataset. Verify activity/error rows remain present and manifests report exclusions, while `included_tables` remains null. The isolated 1,000-row fixture verifies export contents/size, not production-size performance.
- LOG-1.7: restore a new default backup on an approved disposable application DB through the real admin flow, confirm `INFO FOR TABLE access_logs` has fields/indexes and `INFO FOR DB` reports SCHEMAFULL, then send a normal request and confirm the buffered logging pipeline stores a fresh access row. Verify the next boot reapplies the invalidated schema. Local live checks exercised the actual export/import/schema helpers and a direct new access insert; worker ordering/rollback is unit-tested, but a deployed Nitro restore plus live logger traffic was not run.
- LOG-1.7: in both admin locales, verify Include access logs defaults off and saves/reloads correctly; enable it and confirm full/incremental backups restore the old all-table behavior. Partial backups should continue respecting their explicit table selection regardless of this checkbox. Automatic safety snapshots must still include all tables for rollback.

- LOG-1.8: recreate the deployed app with the updated Compose file and env values (`docker compose -f deploy/production/docker-compose.yml up -d --force-recreate app`); restart alone does not apply env-file or logging-driver changes. Verify `docker inspect --format '{{json .HostConfig.LogConfig}}' pandablog-app` reports `json-file`, `max-size: "10m"`, and `max-file: "5"`. On a disposable container/approved test host, generate enough output to confirm rotation discards oldest logs and retains at most five files. Docker is unavailable in this session; only YAML/env configuration was validated locally.
- LOG-1.8: after deploying the rebuilt logging sink, verify env defaults produce JSON error lines, the documented `grep`/`jq` and request-ID commands work, and recreated containers honor `off`/`all` and `pretty` overrides. Existing LOG-1.1/LOG-1.2 production checks remain pending. Preserve any needed old Docker logs before recreation; container log history is not a durable archive.

## Phase 1 verification and deployment checklist (LOG-1.9)

### Local acceptance evidence (2026-10-04–05)

All checks used a **separate source copy without the project's `.env`, generated builds, DB data, or storage**, a loopback-only Nuxt dev server, and a disposable SurrealDB **3.2.4** memory container. Runtime requests used a DATABASE EDITOR pool; schema/restore used ROOT. A disposable superadmin and synthetic records/media were created. Temporary probe routes existed only in that copy and are **not** in the application or deployment image. The app processes, DB container, and scratch files were removed after recording results. No configured application/production DB or storage was used.

| Spec / acceptance criterion | Local result | Still required on staging/production |
|---|---|---|
| 01: thrown API error → one structured error with stack/request ID | Passed real HTTP; one subsystem JSON entry, status 500, stored cause depth 3 and true unhandled flag. Intentional 500 lacked unhandled; explicit 400 bypassed hook threshold and redacted context secrets. | Production stderr/Docker routing and exact line count (dev wrapper caveat above). |
| 01: 401 API / 404 page → no error entry or row | Passed real API 401 and Nuxt 404 page; zero new error JSON entries/rows at threshold 500. | Repeat with deployed image and default/saved threshold. |
| 01: console independent of error storage/DB | Passed with error storage disabled, then with the actual disposable DB stopped: one structured error still emitted. | Repeat safely on disposable staging; do not stop the production DB for a test. |
| 01: `off`, `all`, live `console_output` upgrade | Passed separate dev process startups: off stayed silent with toggle on and a thrown 500; all emitted one access entry with toggle off; saved toggle upgraded errors live. | Container recreation/env checks; unrelated `console.*`/Nitro diagnostics remain outside subsystem control. |
| 01/02: settings and Last run/Run now | Real Chromium checks in **en and zh-CN** passed threshold default 500 → save 400 → reload → reset 500, and actual Run-now/report rendering. Reload preserves defaults/exclusions/redaction instead of showing a failed SSR load. Anonymous retention GET/POST returned 401; unit tests cover non-superadmin rejection/single-flight/partial failures. | Deployed HTTP/auth, UI partial reports, simultaneous triggers, and overnight timing. |
| 02: 600K retention without timeouts/memory spikes | **Not verified at 600K:** seed OOM before retention. On **6,005 expired rows**, real runner removed 6,005, left zero rows older than 30 days, preserved a recent row, and reported no errors in **512 ms** (590 ms including verification). Two interleaved health probes peaked at 16.2 ms; sampled dev worker RSS was 1,433.9 → 1,435.0 MiB. | Backed-up persistent 600K-row DB copy, sustained memory/latency monitoring, real disk sizes/compaction. This short dev sample is not a production memory guarantee. |
| 02: manual cleanup/purge counts | Browser age cleanup deleted 7 expired error rows; keep-latest deleted 2 of 4. After the routing fix, real DELETE `/api/admin/logs/errors` purged the remaining 2. New H3 tests cover all three streams, cached static-route fallback, bad tokens, unsupported paths, and 401/403. | Buffered access cleanup/purge and timestamp-boundary behavior at production scale; no purge UI currently exists. |
| 03: health <20 ms, no access entries | 25 real HTTP health requests: final warm median **4.39 ms**, warm max **11.35 ms**; no-store, no version details, zero health access rows/console entries after buffer flush, even with saved exclusions emptied. Real optional DB probe succeeded; with DB stopped, plain health remained 200 and DB probe returned generic 503 in **2,026 ms**. | Production warm latency, private/restore mode, and Docker `healthy`; private/maintenance fences are covered by existing H3 tests but not claimed as deployed checks. |
| 03: about 2,880 fewer daily healthcheck requests | No 24-hour observation; no After P1 numbers invented. | Rerun baseline after 24 h and separate health/i18n reductions from retention and traffic changes. |
| 04: default full backup excludes access rows; opt-in restores old behavior | Real workers on 1,000 synthetic access rows: full gzip **7,839 bytes** without access versus **32,613 bytes** with access. Default incremental also excluded access. Activity/error fixtures remained, manifests listed exclusions, full/incremental `included_tables` stayed null. Checkbox default/save/reopen/opt-out passed in both locales. | Production-size backups/performance; empty-media archive issue below is a separate known limitation. |
| 04: restore yields working SCHEMAFULL access logging | Actual authenticated restore worker imported the default full snapshot, recreated SCHEMAFULL access table with all fields/3 indexes, left zero old fixture access rows, invalidated `__schema_hash`, and stored **one fresh buffered access entry from real HTTP**. | Approved staging restore/reboot and production rollback procedure. Safety selection/rollback remain covered by existing unit tests; successful restores remove their temporary safety dump. |
| 01 §7: Docker rotation | Compose/env YAML assertions passed in LOG-1.8; Docker CLI/daemon integration not exercised here (Podman was used for DB fixtures only). | Inspect `json-file`, `10m`, `5`; test actual rotation on a disposable Docker container. |

### Operator rollout checklist

Run from the project root unless noted. Check boxes are **operator gates**, not results of this local session.

1. **Before starting the rebuilt app:**
   - [ ] Test on a backed-up **production DB copy** first; approve the configured retention windows and resulting deletions. The new app automatically trims enabled streams **five minutes after boot**, and daily at **03:17 server time** (UTC in the image). There is no new env switch to disable just this scheduler.
   - [ ] Take a verified rollback DB/media backup or host snapshot. To preserve the existing log history too, use an unrestricted DB export or a backup with **Include access logs enabled**; default new full backups deliberately omit it. Preserve any needed old Docker logs before recreation. Do not run cleanup/purge against production without approval.
   - [ ] Record timestamped row counts, expired-row counts, disk usage, latest DB/media gzip sizes, image version, and saved logging/backup settings. Keep custom exclusions/redaction/retention values; do not blindly reset production settings.
   - [ ] Review the existing empty-media backup limitation: snapshots with zero media paths (including an incremental with no new media) may fail with `no paths specified to add to archive`. This predates LOG-1.9 and remains a follow-up; ensure the rollback backup is actually ready/verified, not merely requested.

2. **Build and transfer the actual Phase 1 image/config:**
   - [ ] Include all LOG-1.1–LOG-1.9 changes and module selections (`logs` plus the desired streams). Commit/review the intended source before release; the build-version guard refuses a dirty checkout unless explicitly allowed for a `.dirty` test build. No release commit was made by this task.
   - [ ] Build from the project root and transfer/load the resulting image on the production host using the established deployment process. Preserve its build identity and native-module base choice; don't deploy the old `pandablog-latest.tar.gz` just because it already exists.

     ```bash
     npm run container:build
     # Or: npm run docker:build / npm run podman:build
     ```

   - [ ] Update the host's `deploy/production/docker-compose.yml` and existing `.env` (do **not** replace real secrets with the example). Set plain `LOG_CONSOLE=errors` and `LOG_FORMAT=json` (no `NUXT_` prefix); keep the existing `NUXT_SURREAL_*`/session values and storage ownership. The image sets `NODE_ENV=production`. Set `PANDABLOG_IMAGE` to the exact loaded image tag if using an override.
   - [ ] Confirm the external `nginx` network and app-storage mount exist. Validate configuration without printing secrets, then **recreate**, not merely restart:

     ```bash
     docker compose --env-file deploy/production/.env -f deploy/production/docker-compose.yml config --quiet
     docker compose --env-file deploy/production/.env -f deploy/production/docker-compose.yml up -d --force-recreate app
     docker exec pandablog-app panda info
     docker inspect --format '{{json .HostConfig.LogConfig}}' pandablog-app
     docker inspect --format '{{.State.Health.Status}}' pandablog-app
     docker exec pandablog-app panda health --timeout 4
     ```

     Expected: the intended version, `json-file` with string options `10m`/`5`, and `healthy`. Env vars are cached at process start, and an env-file edit only reaches the app when the container is recreated.

3. **Observe startup and acceptance on staging, then approved production checks:**
   - [ ] Confirm schema initialization adds optional `error_logs.status_code`, and the `__logging_excluded_paths_v2` migration preserves custom prefixes while adding defaults. The approved defaults omit nonexistent robots/sitemap routes and include `/_i18n`. Reboot after removing a removable default in staging; it must stay removed. `/api/health` remains hard-excluded.
   - [ ] In both locales, verify settings load/save/reload/reset, empty excluded-status text, and retention Last run/Run now. Check GET `/api/admin/logs/retention` authorization and report reset after restart. Trigger POST `/api/admin/logs/retention/run` or Run now **only after deletion approval**; it uses saved, not unsaved form settings.
   - [ ] On disposable staging, exercise an approved controlled thrown 500, 401 API, and 404 page. With defaults, require one subsystem JSON `error_log` with escaped `err.stack`, `request_id`, and status for the 500; no 401/404 error entry/row. Verify stored status/cause/crash flags. Temporary test routes must be removed before building the release image.
   - [ ] Inspect/correlate errors (host `jq` required). Do not add `docker logs --timestamps` before piping to `jq`:

     ```bash
     docker logs --since 15m pandablog-app 2>&1 | grep '"kind":"error_log"' | jq .
     docker logs --since 15m pandablog-app 2>&1 | grep -F '<actual-request-id>'
     ```

   - [ ] On staging, verify `LOG_CONSOLE=all` emits one access entry per **non-excluded, sampled** request, `off` silences the subsystem despite the admin toggle, and the toggle upgrades `errors` live. Recreate for env changes, then restore `errors`/`json` and the intended toggle after the test. Test real rotation only in a disposable Docker container; do not deliberately flood production logs.
   - [ ] Warm `/api/health` should return 200/no-store in <20 ms with no access entry. Optional `?db=1` is connectivity only, not restore/schema readiness. Verify private/restore mode on staging; a restore-status poll may transiently fail while the DB is replaced, so confirm the final job/schema/data state rather than declaring success/failure from one response.
   - [ ] For the first deferred/approved manual retention run, capture the report, elapsed time, RSS/DB memory and ordinary-request latency; verify no remaining rows beyond each **saved** cutoff. Observe the next 03:17 run. Retention audit `system.log_retention` is stored only for deletions/failures and is console-visible only in effective `all`; default `errors` may show no successful-run console line. Warnings indicate failures; inspect `report.errors`, not just console silence.
   - [ ] Create default full/incremental backups; inspect manifests and compare to an opt-in backup of the same dataset. The count below should be 0 for the default (plain `grep 'access_logs:'` falsely matches `include_access_logs:`):

     ```bash
     zcat '<snapshot-dir>/db.surql.gz' | grep -cE '(^|[^[:alnum:]_])access_logs:' || true
     ```

     If a log message itself contains a record-ID string, inspect the matched lines/schema or restore into staging to distinguish metadata from actual access records. Verify activity/errors remain, opt-in includes access, and an approved staging restore leaves SCHEMAFULL access fields/indexes and accepts fresh buffered HTTP logs. Check the next boot reapplies the invalidated schema hash.

4. **Record the After P1 measurements (immediate cleanup and after 24 h):**
   - [ ] Rerun spec 03 §2 SELECT queries in Surrealist against the explicitly selected production ns/db, off-peak. `scripts/log-baseline.mjs` is read-only but requires **plain `SURREAL_*` variables**, not the template's `NUXT_SURREAL_*`; do not accidentally use the project's dev `.env`. Capture before/after/deltas in the Baseline **After P1** column and annotate elapsed time/traffic window.
   - [ ] Replace the known broken datetime min/max aggregate with these queries (the indexed ordering defect was observed on SurrealDB 3.2, so use `WITH NOINDEX`):

     ```sql
     SELECT timestamp FROM access_logs WITH NOINDEX ORDER BY timestamp ASC LIMIT 1;
     SELECT timestamp FROM access_logs WITH NOINDEX ORDER BY timestamp DESC LIMIT 1;
     SELECT count() AS n FROM access_logs WHERE timestamp < time::now() - 30d GROUP ALL;
     ```

     The last query assumes the saved access retention is 30 days; adjust it to the actual configured window and also check activity/errors. No 600K cleanup/disk acceptance has been claimed by this session.
   - [ ] Record `du -sh` of the **actual SurrealDB data directory** (baseline `~/container/pandablog/surreal_data`), dashboard estimate separately, and the actual DB/media backup files. Storage compaction may delay disk reclamation. Capture `docker logs --since 24h pandablog-app 2>&1 | wc -l` before older logs rotate away; it is a bounded snapshot, not a durable daily counter.
   - [ ] Compare healthcheck `/` traffic per 24 h: roughly 2,880/day should disappear after the rebuilt CLI targets `/api/health`; separately record i18n/default-exclusion changes, error-noise reduction, and normal traffic. Leave the After P1 cells blank until these **operator** observations exist.

## Session log

_Newest first. One entry per session: date, tasks touched, summary, files changed, test results, follow-ups._

### 2026-10-04–05: LOG-1.9 (done; operator acceptance pending)
- Read specs 00–04 and confirmed every LOG-1.1–LOG-1.8 dependency is done. Re-ran baseline lint/typecheck/unit checks: all passed (45 files, 566 tests). Built an isolated source copy and real loopback Nuxt dev/SurrealDB/Chromium verification harness, with disposable credentials, DATABASE EDITOR runtime, temporary sandbox-only probes, synthetic log rows, and synthetic media. No project `.env`, configured DB, existing storage, or production operations were used.
- Fixed the three directly relevant pre-existing failures described under Decisions: `pages/admin/dashboard/logs/settings.vue` now uses session-aware SSR reads and a pure `parseExcludedStatusCodes` helper in `utils/loggingSettings.ts`; `server/api/admin/logs/[type].delete.ts` uses an authorized/allowlisted path fallback for H3 static-GET/dynamic-DELETE matching. Extended `tests/unit/logging-logic.test.ts` with six parser cases, added eight real H3 HTTP cases in `tests/unit/log-purge-http.test.ts`, and added its `.gitignore` exception. No new settings/schema fields or UI translation strings were introduced.
- Recorded the actual HTTP/UI/DB/retention/backup/restore results and their limitations in the acceptance table above. The 600K seed OOM is explicitly not a retention failure or successful scale verification. Local browser cleanup and live purge counts passed; default/opt-in full backups and an incremental with new media passed; actual restore repaired the schema and accepted new buffered HTTP access logging. Both locale settings flows passed after fixes. Defaults, all/off startup modes, live toggle, DB-down console output, and bounded DB health failure were checked on the real dev app.
- Final checks: `npm run lint`, `npm run typecheck`, `npm run test:unit` all pass (**46 files, 580 tests**); `git diff --check` passes. Existing unrelated working-tree changes were preserved. Temporary processes/container/probe routes/data/media/scripts were removed after results were transcribed; no verification routes are shipped. The pre-existing Podman VM was restored to its stopped state after the resumed session's checks.
- Added the ordered operator rollout/rollback/measurement checklist above, including rebuild/version guard, existing-secrets/env updates, exact Compose recreation/inspection, startup migration/deletion warning, console/health expectations, approved retention and restore checks, corrected backup record matching, and repeatable After P1 measurements. Production/600K/Docker/overnight/24-hour gates and the unrelated empty-media archive limitation remain explicit follow-ups, not passing claims. Next code task is LOG-2.1; deploy LOG-2.1–LOG-2.7 together per the plan.

### 2026-10-04: LOG-1.8 (done)
- Added app-service Docker `json-file` rotation (`max-size: "10m"`, `max-file: "5"`) in `deploy/production/docker-compose.yml`. Existing `env_file: .env` already passes the plain logging variables into the container; no runtime code or settings changes were needed.
- Added `LOG_CONSOLE=errors` and `LOG_FORMAT=json` to `deploy/production/.env.example`, with allowed values, defaults, stdout/stderr routing, admin-toggle/storage interaction, plain-name/startup semantics, and container-recreation guidance.
- Updated `Readme.md`'s Docker deployment section to distinguish Nuxt-prefixed runtime config from plain env vars, protect the direct `docker run` example with equivalent rotation flags, and document console modes/formats, invalid-value fallback, filters/sampling, rotation scope/limits, recreation/inspection, JSON error filtering with host `jq`, and request-ID correlation. The comprehensive `docs/logging/operations.md` runbook remains LOG-4.2; current console commands are available in the README now.
- Checks: `npm run lint`, `npm run typecheck`, and `npm run test:unit` all pass (45 files, 566 tests); `git diff --check` passes. Parsed the Compose YAML with `yaml` and asserted the exact logging driver/string options, unchanged env-file wiring, and production env defaults. No new pure logic or application UI strings were added, so no new unit tests or translations were required.
- Follow-up: deployed Docker rotation/env/command checks above. No Docker daemon/Compose integration, live app, configured DB, or production storage was accessed. Existing unrelated working-tree changes were left intact. Next task is LOG-1.9.

### 2026-10-04: LOG-1.7 (done)
- Added `include_access_logs: false` to `server/utils/settings.ts`'s backup type/defaults/normalization, optional boolean validation to `server/api/admin/backups/settings.put.ts`, and a checkbox/form/load/save field in `components/admin/backups/BackupSettingsDialog.vue`. Added matching label/help strings in both locale JSON files; legacy and malformed settings normalize to exclusion without a migration.
- Added pure `server/utils/backups/selection.ts → buildFullBackupSelection`; `create.ts` uses the actual DB table list for full/incremental snapshots, retaining activity/error/application tables and leaving partial selection and `included_tables` semantics unchanged. Added `excluded_tables` to manifests and preserved optional external manifest metadata in `importExternal.ts`. Corrected empty-list serialization in `surrealHttp.ts` and clarified the full-snapshot comment in `config.ts`.
- Extracted schema loading/module stripping/hashing/application (including the existing post-stats compatibility reset) from `server/plugins/db-init.ts` into `server/utils/schema.ts`. Boot still applies only on a hash mismatch and updates its marker. `restore.ts` now deletes the imported hash and applies the current schema immediately after import verification, closes ROOT in finally, and allows failures to trigger existing rollback. Fixed dedicated-root routing in `server/utils/db.ts` so the initialized runtime pool cannot receive these privileged queries.
- Added `tests/unit/backup-selection.test.ts`, `backup-create.test.ts`, `backup-restore-schema.test.ts`, `backup-settings.test.ts`, and `schema.test.ts`, with `.gitignore` exceptions; extended `db-reconnect.test.ts`. Coverage includes no mutation/missing or access-only tables, unrestricted opt-in, full/incremental/partial worker selection and manifest semantics, external metadata, gzip output, settings defaults/validation/authorization/merging, fail-closed settings reads, schema module flags/hash/compatibility resets, repair ordering/current-hash invalidation/ROOT cleanup/failures/rollback, and dedicated-root versus stale-runtime routing. Existing boot-migration tests continue passing with the extracted schema helper.
- Live verification used a loopback-only disposable SurrealDB 3.2.4 memory container, separate temporary working/schema directory, synthetic data, and an active DATABASE EDITOR runtime pool. The real HTTP export of 1,000 access rows plus audit/error fixtures was **29,303 bytes gzip** with access versus **3,644 bytes** without; the filtered dump had no access records or table definition and retained activity/error records. After import into a separate empty DB, real immediate schema application recreated SCHEMAFULL access logging with all fields/three indexes, accepted one fresh access row, and left the schema hash invalidated. Explicit empty selection exported no tables. Removed the temporary script/directory/container; no configured application DB or storage was accessed.
- Baseline checks passed (40 files, 522 tests). Final checks: `npm run lint`, `npm run typecheck`, `npm run test:unit` all pass (45 files, 566 tests); `git diff --check` passes.
- Follow-up: deployed backup UI/size/restore/live traffic checks above. Next task is LOG-1.8; older production acceptance checks remain pending.

### 2026-10-04: LOG-1.6 (done)
- Extended server defaults and the admin form fallback via the shared `utils/loggingSettings.ts` list: existing Nuxt/favicon/admin-log prefixes plus health, analytics tracking, IPX, Nuxt error rendering, and i18n locale assets. Checked routes against `server/`, `public/`, configured Nuxt modules, module handler registrations, and generated Nitro route types. Omitted nonexistent robots/sitemap routes and documented the i18n/internal-request decision above. No new settings fields or user-facing strings were added.
- Added pure `mergeExcludedPaths` in `server/utils/logging-logic.ts`: ordered, exact-value set union with no input mutation. Added the boot-phase `__logging_excluded_paths_v2` marker migration in `server/plugins/db-init.ts`; it preserves custom prefixes and all other stored fields, initializes absent/invalid settings, writes the marker only after settings persist, and reloads the runtime cache. Marked installs retain subsequent admin edits on restart.
- Updated `server/utils/logging.ts`, `pages/admin/dashboard/logs/settings.vue`, and the logic test fixture. Extended `tests/unit/logging-logic.test.ts` and `logging-console-routing.test.ts`; added `tests/unit/logging-excluded-paths-migration.test.ts` with a `.gitignore` exception. Tests cover order/deduplication/custom entries/idempotency/no mutation, default path filtering, both access sinks/middleware, independent default arrays/reset persistence, real boot-plugin control flow with mocked DB/bootstrap dependencies, module-off gating, fresh/malformed/legacy settings, privileged write/marker/cache ordering, early-cache refresh, second-boot admin removals, and failures/retries without premature markers.
- Baseline checks passed (39 files, 482 tests). Final checks: `npm run lint`, `npm run typecheck`, and `npm run test:unit` all pass (40 files, 522 tests); `git diff --check` passes. No configured application/production DB, app storage, or live destructive startup was used.
- Follow-up: deployed migration/admin UI/traffic/24 h volume checks above; inherited health latency/Docker checks remain pending. Next task is the optional LOG-1.7 decision.

### 2026-10-04: LOG-1.5 (done)
- Added `server/api/health.get.ts`: public default `{ ok: true, uptime_s }` without DB/auth/session/settings work, no-store responses, and an opt-in `db=1` query using `RETURN 1` with two-second query/overall timeouts and reconnect retries disabled. Failures return generic HTTP 503 JSON without throwing into the error hook or exposing details.
- Added `isHealthCheckPath` in `server/utils/logging-logic.ts` and applied it to both the access-recording predicate and `server/utils/logging.ts`'s middleware path exclusion. Updated the exact allowlist in `server/middleware/restore-maintenance.ts`. Confirmed existing site-visibility and safe-method origin rules already admit health GET requests.
- Updated `bin/panda.mjs`'s default URL/help to `/api/health`, preserving `--url`, timeout handling, NITRO_PORT/PORT precedence, and the non-5xx-is-healthy rule. Updated `docs/versioning-and-cli.md` with liveness versus optional DB connectivity semantics and the new URL. Compose healthcheck commands are unchanged. No new application UI strings or settings were added; protocol fields and the existing English operator CLI remain untranslated.
- Added `tests/unit/health.test.ts` and `tests/unit/health-http.test.ts`, with `.gitignore` exceptions, and extended logging logic/console-routing tests. Tests cover response/header shape, absent build details, optional DB success/error/deadline/late rejection, hard access exclusion, private/restore/origin middleware behavior, and real CLI subprocesses probing a local H3 HTTP server (URL/ports/custom statuses/timeouts/help). DB/site/auth/job dependencies and logging sinks are mocked; H3 HTTP handling and CLI subprocesses are real. No configured application DB/storage or destructive app startup was used.
- Baseline checks all passed (37 files, 447 tests). Final checks: `npm run lint`, `npm run typecheck`, and `npm run test:unit` all pass (39 files, 482 tests). `git diff --check` passes.
- Follow-up: deployed Nitro latency/DB/Docker checks and 24 h volume measurements above. Default-exclusion merging/internal SSR volume decisions remain LOG-1.6. Next task is LOG-1.6.

### 2026-10-04: LOG-1.4 (done)
- Extended `server/utils/log-retention.ts` with the module/settings-aware, single-flight retention runner, per-stream failure isolation, conditional `system.log_retention` audit/warn output, and copied in-memory last reports. Added the shared `RetentionReport` type to `types/logging.ts`. Access rows are flushed before retention; empty successful runs produce no audit entry.
- Added `server/utils/cron.ts` by extracting download cleanup's safe loader/normalizer; refactored `server/plugins/download-cleanup.ts` to use it without changing its schedule/file-cleanup behavior. Added `server/plugins/log-retention.ts` for daily `17 3 * * *` scheduling, an unref'd five-minute boot timeout, failure diagnostics, and close-hook stop/destroy/timeout cleanup. Added the logs-disabled plugin exclusion to `modules/feature-flags.ts`.
- Added superadmin endpoints `server/api/admin/logs/retention.get.ts` (last report/schedule) and `server/api/admin/logs/retention/run.post.ts` (shared runner/report). Updated `pages/admin/dashboard/logs/settings.vue` with last-run counts/time, Run now, saved-settings guidance, progress/error handling, and partial-report details. Updated retention copy and all new strings in both locale JSON files.
- Extended `tests/unit/log-retention.test.ts` with runner coverage; added `tests/unit/cron.test.ts`, `download-cleanup.test.ts`, `log-retention-plugin.test.ts`, and `log-retention-api.test.ts`, with `.gitignore` exceptions. Coverage includes gates/cutoffs/flush ordering, no-op/audit rules, partial and initialization failures, exact promise sharing/cache safety, cron module formats/loading, boot/cron/close callbacks, media-cleanup regression, and endpoint authorization/response shapes.
- Live verification used a loopback-only, disposable SurrealDB 3.2 memory container and a separate temporary working/storage directory; no `.env` or configured application DB/storage was used. The real node-cron loader validated/scheduled the daily expression and stopped/destroyed its task. The real runner removed 13 expired rows (10 access including 7 buffered, 2 activity, 1 error), preserved cutoff boundaries/recent rows, shared its in-flight promise, persisted one complete audit report, and cached the report. An empty second pass removed zero and wrote no new audit. The container, temporary script, and scratch storage were removed.
- Baseline checks all passed (33 files, 399 unit tests). Final checks: `npm run lint`, `npm run typecheck`, and `npm run test:unit` all pass (37 files, 447 tests). `git diff --check` passes.
- Follow-up: operator deployment, real HTTP/UI/overnight scheduling, and production-scale backlog measurements above. No production deletions were performed. Next task is LOG-1.5.

### 2026-10-04: LOG-1.3 (done)
- Added `server/utils/log-retention.ts` with `deleteLogsOlderThan`, `deleteLogsKeepLatest`, and `purgeLogTable`. Deletions select at most 2,000 IDs and return only a scalar count per batch, pause 50 ms between full batches, and stop at a short batch or the 10,000-batch safety limit. Batch queries have descriptive labels, 30 s timeouts, and reconnect retries disabled. Table/field/options/date/count validation prevents unsafe or malformed queries.
- Refactored `runManualLogCleanup` and `purgeLogType` in `server/utils/logging.ts` to call the helpers; removed the private unbounded delete helpers. Preserved access-buffer flush ordering, cleanup response/audit payloads, and bounded (200-ID) `deleteErrorLogsByIds` with `RETURN BEFORE`. No `RETURN BEFORE` remains on bulk log cleanup/purge paths.
- Added `tests/unit/log-retention.test.ts` and `tests/unit/logging-cleanup.test.ts`, plus `.gitignore` exceptions. Tests cover batching/summing, defaults/limits/pauses, allowlists/input failures, SDK/wrapped results, JS/string/SDK date cutoffs, keep/purge behavior, buffer ordering, response/audit compatibility, failures, and selected-error deletion bounds. No settings or user-facing strings were added.
- Verified the real helpers using the project's SDK/query wrapper against a disposable, loopback-only Podman memory DB running SurrealDB `3.2.4+20260803.93ab219`, with schema-full log tables and the timestamp index. Removed 6,005 expired access rows in four batches (~308 ms), preserved boundary/newer rows, and verified keep-latest/purge counts, timestamp ties, empty purge, error logs, and error-group `last_seen`. The indexed-cutoff bug found in this check is documented above. Temporary verification scripts and the container were removed; no configured application/production DB was accessed.
- Baseline checks: lint, typecheck, and unit tests all passed (31 files, 331 tests). Final checks: `npm run lint`, `npm run typecheck`, and `npm run test:unit` all pass (33 files, 399 tests). `git diff --check` passes.
- Follow-up: production-scale and admin UI checks above; scheduled retention/runner/cron remain LOG-1.4. Next task is LOG-1.4.

### 2026-10-04: LOG-1.2 (done)
- Added `error_log_min_status` (integer 400–599, default 500) throughout `types/logging.ts`, `server/utils/logging.ts` defaults/validation/normalization, and `pages/admin/dashboard/logs/settings.vue` form/payload/reset. Added the Errors number input and matching strings in `i18n/locales/en.json` and `i18n/locales/zh-CN.json`.
- Updated `server/plugins/logging-error-hook.ts` to pass resolved error/response status and respect build-time/runtime logs/errorLogs module flags. Updated `server/utils/logging.ts` to filter only hook-sourced errors before either sink, store `status_code`, output console `status`, and add redacted cause summaries and true H3 crash flags to context. Explicit application calls still bypass the threshold; console output remains independent of storage settings.
- Added optional `error_logs.status_code` inside the logs module section of `server/utils/schema.surql`; existing rows need no backfill.
- Added pure capture/status/cause/flags helpers in `server/utils/logging-logic.ts`, reused the cause helper in `server/utils/log-console.ts`, and introduced the `ErrorCause` type.
- Extended `tests/unit/logging-logic.test.ts` (including its settings fixture), added `tests/unit/logging-error-capture.test.ts` and `tests/unit/logging-error-hook.test.ts`, and allowed these files in `.gitignore`.
- Baseline checks: lint, typecheck, and unit tests all passed (29 files, 272 tests). Final checks: `npm run lint`, `npm run typecheck`, and `npm run test:unit` all pass (31 files, 331 tests). `git diff --check` passes.
- Follow-up: production/schema/admin UI checks are listed above. No production DB mutations or full app/Docker verification were performed. Next task is LOG-1.3.

### 2026-10-04: LOG-1.1 (done)
- Added `server/utils/log-console.ts`: pure env resolution, cached startup config with one warning per invalid env var, effective-mode resolution, JSON/pretty formatting, ordered/nullable envelope fields, redaction and metadata trimming, circular/BigInt/record-ID-safe serialization, three-level console cause chains, and a UTF-8-aware 16 KB cap. Warn/error entries use stderr; info/debug/access/activity use stdout. Stream exceptions and asynchronous error events are swallowed.
- Replaced `mirrorConsole` and subsystem diagnostics in `server/utils/logging.ts` and `server/utils/logging-access-buffer.ts`. Console output no longer depends on storage enable switches. Info/debug retain level/debug gating; warn/error diagnostics remain visible in `errors` mode. The DB toggle dynamically upgrades `errors` to `all` but cannot override `off`.
- Updated `consoleOutputDescription` in `i18n/locales/en.json` and `i18n/locales/zh-CN.json`; the existing settings UI already uses these keys.
- Added `tests/unit/log-console.test.ts`, `tests/unit/logging-console-routing.test.ts`, and `tests/unit/logging-access-buffer-console.test.ts`, with `.gitignore` exceptions so the new tests are included in version control.
- Baseline checks before changes: lint, typecheck, and unit tests all passed (26 files, 230 tests). Final checks: `npm run lint`, `npm run typecheck`, and `npm run test:unit` all pass (29 files, 272 tests). `git diff --check` passes.
- Follow-up: operator production checks listed above; next code task is LOG-1.2. Docker rotation/env deployment documentation remain LOG-1.8. No DB schema, error status filtering, or stored cause changes were made.

### 2026-10-04: LOG-0.1 (done)
- Added `scripts/log-baseline.mjs`, which runs the spec 03 §2 queries read-only.
- Ran it against the `.env` DB. That is a dev instance (54 access rows), so the snapshot is recorded as dev only.
- No tests, lint or typecheck run (a standalone script, no app code touched).
- Operator reported host figures: `docker logs` 22 lines, latest backup 32.9 MB DB + 1.9 MB media, and a `du -sh` of the home dir (4.1 GB, not the DB volume).
- Operator ran the production queries in Surrealist. Results and findings are in the Baseline section: 635K access rows, 14.5% healthcheck, 84% internal SSR sub-requests with no IP.
- Follow-up: decide in LOG-1.6 how to handle the internal-request volume and `/_i18n`. Fix the min/max usage. Optionally record the oldest timestamp.

### 2026-10-04: planning
- Created `docs/logging/plan.md`, `progress.md`, and specs 00–06.
- No code changes.
- Next: LOG-0.1 (operator), then LOG-1.1.
