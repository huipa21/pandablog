# Access-log retirement: progress and evidence

Read [plan.md](./plan.md), [acceptance-test.md](./acceptance-test.md) and [operations.md](./operations.md). This is the mutable execution ledger; stable contracts remain in the plan.

## Status and authority

**Implementation complete in the working tree; verified in isolated local fixtures, not deployment-approved.** The default-worker unit quality gate remains blocked by existing timing-sensitive tests; the full bounded suite passes. The recommended code/compatibility decisions in plan section 2 are accepted for this assignment. Operator proxy retention, production-copy archival/deletion, deployment and downgrade still require separate authorization.

Source baseline: `d1b2f79`. Initial application tree was clean; the preceding planning docs/cross-link were already dirty and preserved. No user's `.env`, configured DB, storage/history, existing container/proxy configuration, credentials or deployment was operated on. No commit/push performed. DB/app tests use owned temporary source/storage, generated loopback targets/credentials and a disposable DB child. Proxy tests use exact generated, labeled containers/network/volume, not the existing app/proxy containers.

## Implemented behavior

- Removed access store/reader/cache/migration, legacy export/table-removal boot calls, exclusion settings migration, shutdown plugin and 00:05 UTC maintenance invocation. Remaining daily/boot/manual DB retention and error backfill remain.
- Removed Access API/UI/redirect/chart/storage/cleanup controls, access-only types/helpers/locale keys, active access module flag/define/configurator field and per-request console entries. Generic detail/export/purge rejects retired access too; cleanup rejects access with 400. Stats/reports omit access fields, not fake zeros.
- `request-id.ts` helper/middleware/Nitro plugin and the outer maintenance handler retain server-owned context/response IDs independently of logging. Incoming IDs are ignored; exact health paths remain ID-free. Before-response hook reapplies the current ID after cached headers without cache-key variation.
- Legacy boolean manifest `logs.accessLogs` remains accepted as no-op input, absent from normalized runtime output/defines. The operator's manifest was not rewritten. Legacy saved settings, including malformed values, normalize in memory without boot rewrite; ordinary saves omit retired fields; new PUTs reject them.
- Existing access files/buffers/receipts/rows/markers remain untouched. Supported full restore now preserves a legacy access table inertly through normal all-table validation/import/paired rollback; unsupported backup formats and all other restore safeguards remain.
- Caddy filtered JSON removes headers and query strings and records the upstream response ID. nginx has an explicit http-context JSON format, vhost logging and an operator logrotate/reopen example. Proxy history stays outside the app; no ingestion/archive platform added.
- Current logging/backup/runtime/backend runbooks, route matrix, README and historical-spec precedence notices updated. Old evidence is not rewritten into new passes.

## Task ledger

| Task | State | Evidence / remaining work |
|---|---|---|
| AL-00 | Done | Approved implementation, rechecked inventory; new characterization tests first failed for missing retirement/ID behavior |
| AL-01 | Implemented; local checks passed | H3/Nitro correlation, real cached route, error DB ID and disposable Linux proxy tests; deployed HTTPS/edge remains operator evidence |
| AL-02 | Done locally | Runtime removed; HTTP/parser/settings/stats/retention/preservation regressions; actual app boot/restart preserves cold source/marker/receipt |
| AL-03 | Done locally | All seven profiles passed typecheck/build/browser/history/ID checks; full/minimal/no-observers rerun after final settings-preservation correction |
| AL-04 | Implementation/handoff complete; quality gate partially blocked | Final lint/style, bounded unit, guarded DB, full/minimal emitted-server scan and docs/source checks passed; default-worker timing failures and external operator gates remain, not waived |

## Local verification already executed

Runtime: Node **22.22.0**, Windows **10.0.26300**, SDK **2.0.3**, Nuxt **4.4.8**, Nitro **2.13.4**, Vitest **4.1.6**, stable SurrealDB **3.2.4+20260803.93ab219**. Proxy containers run Linux through Podman: Caddy **v2.10.2** (`h1:g/gTYjGMD0dec+UgMw8SnfmJ3I9+M2TdvoRL/Ovu6U8=`), nginx **1.28.0**.

Commands used the explicit local Node executable `C:/Users/huipa/AppData/Local/Temp/pb-node22.exe`. Live DB binary was `C:/Users/huipa/AppData/Local/Temp/pb-hardening-surreal-3.2.4.exe`. No version fallback/download was used for the DB. Container tooling can pull its explicit fixture image tags; fixture containers/network/volume are removed, existing images/containers are not cleaned up.

### Regressions and unit execution

- Initial `vitest run tests/unit/request-id.test.ts tests/unit/access-log-retirement.test.ts --maxWorkers=2`: failed as expected (missing ID helper and five retirement expectations); after implementation **2 files / 8 passed**.
- Focused retained logging/health/purge/retention/dashboard/error and new ID/preservation checks: **13 files / 216 passed**.
- `vitest run tests/unit/maintenance-crash.test.ts tests/unit/access-log-retirement-http.test.ts tests/unit/runtime-nitro.test.ts --maxWorkers=2`: **3 files / 24 passed**, including actual installed production/dev Nitro lifecycle and cached response IDs.
- Final bounded full suite, `vitest run --maxWorkers=4`: **114 files passed / 1 skipped; 1,112 tests passed / 8 skipped**, 33.57s. Includes three additional malformed-saved-settings preservation regressions: first reproduced boot rewrite (3 DB calls), then passed after read-only normalization.
- Default worker full suite was also executed, not substituted silently. Latest run **without a concurrent app build**: **113 files passed / 1 failed / 1 skipped; 1,111 tests passed / 1 failed / 8 skipped**, 34.04s; existing `media-resources.test.ts` expected abort but its 1-second deadline fired under load. Prior runs also had unchanged Japanese dictionary initialization's 5-second timeout and a Windows `EPERM` journal rename. These timing failures are independently recorded in earlier maintenance/runtime ledgers; no unrelated implementation/timeouts/assertions were weakened. Final targeted `annotate` + `media-resources` rerun: **2 files / 17 passed**, 2.82s. Default concurrency remains an outstanding quality gate, not inferred passed from targeted/bounded runs.

### Real DB full worker and rollback

`node --import tsx scripts/backend-hardening/run.ts --fixture --surreal-bin=<explicit binary>`: **13 files / 24 passed**; final rerun after the settings-preservation correction **122.48s** (earlier 134.36s). The actual full/empty/legacy/imported full workers committed; injected post-media failure rolled back. Every case now seeds legacy access rows, a mismatched exported marker and an unfinished file receipt. Independent comparisons verify row IDs/content and marker/receipt preservation after normal schema/runtime repair and paired rollback. Analytics/session/publication/retention, setup, scoped identities, media and grouped-error SQL regressions also passed. This supports removing the access-specific restore refusal; it does not waive general snapshot/format/restore validation or establish production-scale/crash durability.

### Actual production app/browser profiles

`node --import tsx scripts/backend-hardening/maintenance-app.ts --fixture --profile=<profile> --mode=build --surreal-bin=<explicit binary>`:

| Profile | Typecheck | Production build | en/zh-CN browser, boot/crash/restart/fence and history/ID checks |
|---|---|---|---|
| full | Passed | Passed | Passed, including actual Nitro error DB row/response ID |
| activity-only (legacy access=true) | Passed | Passed | Passed |
| errors-only (legacy access=false) | Passed | Passed | Passed |
| no-analytics | Passed | Passed | Passed |
| no-backups | Passed | Passed | Passed, including destructive recovery detection with backups off |
| minimal | Passed after DTO fix | Passed | Passed; final emitted-server/history/malformed-settings checks also passed |
| no-observers | Passed after DTO fix | Passed | Passed; rerun after malformed-settings correction |

Each copied app has a preexisting cold table/marker and malformed unfinished receipt; repeated real app startup and ordinary crash/restart leave them unchanged. Final full/minimal/no-observers runs additionally seed malformed saved logging settings and verify those stay unchanged. One final minimal attempt failed at the DB binary's bounded `version` command before tests/build; exact-binary preflight and a fresh complete rerun passed. No fixture version gate was disabled or retried against another DB. Browser checks retain authenticated SSR/admin behavior, retired Access 404s, DB-only stats/settings and no dashboard Access requests. Source copies exclude the user's `.env`, manifest and storage; `--dotenv=false` is used.

Fixture-only resource/transport settings are explicit: full Windows Nitro tracing exhausted Node's default ~4-GiB compiler heap after an initial 180s timeout; fixture compilation now uses a finite **8-GiB** heap and **600s** build deadline (typecheck 180s). This does not change deployed app/Docker resource limits or establish constrained-production performance. Loopback HTTP browser fixtures explicitly set `NUXT_SESSION_COOKIE_SECURE=false`; shipped production Secure cookies are unchanged, and real HTTPS/cookie/edge acceptance remains separate. An earlier browser run without that fixture override failed auth/locale setup; it was not a pass.

Disabled profiles exposed route-derived typing in ignored logging/settings SFCs; logging mutation responses are now explicitly typed through the existing session fetch wrapper. Minimal also exposed an existing themes DTO inference error when its route is excluded; a type-only explicit DTO annotation was added, without changing theme behavior. Both disabled profiles subsequently passed the complete fixture; full profile was rerun after shared-fetch and malformed-settings changes.

### Disposable proxy validation

`node --import tsx scripts/backend-hardening/access-proxy.ts --fixture --engine=podman`: **passed** for both actual proxy versions. Tested the shipped log snippet/format using private-network synthetic upstream responses: 200/500 response-ID correlation, edge 403 and unreachable 502/504 without fabricated app IDs, secret/query/header/cookie/referrer/body/UA omission, persistent-volume append across proxy stop/start, real Caddy rotation (1-MiB fixture threshold) and nginx file rotation/reopen. JSON output is read from the owned volume after stopping writers, with byte/expansion bounds.

Fixture corrections before the passing run: await proxy readiness after restart, recognize legitimate unreachable 504 as well as 502, use a read-only running volume reader for remote Podman copies of stopped-container logs. These are fixture corrections, not production logging validation bypasses. The proxy test has a synthetic upstream, not the built app behind HTTPS. Actual complete operator TLS/site config, mount/recreation/age policy and production edge correlation still require operator acceptance.

### Lint/docs/source checks

Final Node-22 ESLint and style-drift checks passed after all runtime/DTO/fixture changes. The proxy helper's initial `no-unsafe-finally` finding was corrected, not disabled. Final `git diff --check` and Node-22 documentation validation passed: **12 changed Markdown files / 98 local links**, JSON parsing, task dependencies and whitespace/newlines for all **13 unignored new paths**. New files are visible in Git status, not staged/committed.

Runtime reference search in server/modules/build/pages/utils/types/composables finds no access engine, filters/retention/console functions or active define; only the deprecated boolean JSON-schema input remains. The fixture scans owned emitted `.mjs` code under finite budgets for retired engine symbols: **full 5,543 emitted entries / 14,818,676 scanned bytes**, **minimal 2,276 entries / 7,576,115 bytes**, both passed. No generated output from the user's app/storage was inspected. These are code-presence checks, not memory/traffic benchmarks. Roughly 2,100 net runtime lines removed (excluding tests/docs/new fixtures); no unmeasured CPU/RSS gains claimed.

## Remaining boundary / handoff

Code retirement and isolated verification are complete. Do not reintroduce a file reader/migration/ingestion service to recover removed UI features. The remaining default-worker timing issue is a separately tracked quality blocker; rerun/fix it in its own scope without weakening media-abort or annotation assertions.

External/combined gates remain: approved production-copy complete-history archives/restore/downgrade; built app behind actual HTTPS/proxy and full operator site configuration; proxy recreation/mount permissions/age/count retention policy, operator cutover and overnight observations. Disposable proxy checks used a synthetic upstream and stop/start plus rotation/reopen, not a live app or proof of 30-day retention. B2/B4/B5 are therefore local partial evidence, not universal release passes. No user data removal, credential/config change, commit/push or deployment follows from these tests.

Follow [operations.md](./operations.md) for a separately authorized cutover. Current app backups still exclude file/proxy history; preserve it separately before retiring an old writer. Existing cold disk data is not automatically reclaimed.
