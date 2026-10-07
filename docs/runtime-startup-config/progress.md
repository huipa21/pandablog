# Runtime startup and environment configuration: progress

**Read first.** Tasks are in [plan.md](./plan.md), contracts in [specs](./specs/01-startup-ownership.md), and operator guidance in [operations.md](./operations.md).

## 1. Current state

- RSC-01–03 core implementation is present, with committed fail-closed startup, config, identity and actual owned Nitro regressions. Task acceptance remains incomplete; do not infer release approval.
- D-01/D-02 implemented: scoped runtime credentials required in development and production, no ordinary runtime ROOT fallback, canonical `public.footerShowPoweredBy` / `NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY`. D-03 removes all deprecated environment-name aliases and adds a root `.env.example`.
- D-04/D-05 implemented: ROOT bootstrap creates only namespace/database/scoped user and closes before scoped schemas/migrations; normal restart works without ROOT. Root example includes 4096 MiB `NODE_OPTIONS` and optional E2E admin keys. Existing privileged backup/restore remains ROOT-dependent; full ROOT-free maintenance is not implemented.
- D-06 follow-up: keep ROOT configured for current backup/restore deployments; normal bootstrap only creates missing scoped users and never resets an existing account on every start. Scoped runtime remains defense in depth against query-level flaws, not RCE containment with ROOT in the process. The development E2E audit covers both tracked and ignored local specs.
- Failed-startup policy is a fenced diagnostic service. `/api/ready` is distinct from liveness; private boot authority and synchronous fencing no longer depend on awaiting Nitro plugins.
- Next work: resolve the full Nuxt build blocker, finish full-app owned dev/production/SSR and optional-module acceptance, then operator/Linux/proxy gates.
- No local `.env` edit, configured app/DB startup or mutation, credential cutover/rotation, existing storage cleanup, deployment or operator recovery was performed. DB mutations and receipt cleanup in tests were confined to generated, owned disposable targets.
- A read-only local receipt/PID check still does not establish DB quiescence or authorize deleting ownership. Historical backend evidence remains historical; new evidence is recorded separately below.

## 2. Task ledger

| Task | Status | Evidence / remaining work |
|---|---|---|
| RSC-00 — Investigation and docs | done | Source/read-only inspection, isolated actual-plugin reproduction, existing targeted tests, documentation link/diff validation |
| RSC-01 — Startup and lifecycle | in-progress | Core implemented; actual production Nitro/H3 + dev-worker entry handoff pass on owned FS with synthetic boot; full-app initialization/watcher/Linux acceptance pending |
| RSC-02 — Environment contract | in-progress | Canonical-only parser/rename/consumers and root/production examples implemented; removed-name/config/runtime regressions added; full Nuxt SSR/client/build acceptance pending |
| RSC-03 — Consistent runtime identity | in-progress | Strict scoped pair, ROOT-only bootstrap and scoped schemas/migrations implemented; real full 31-table schema and ROOT-free reconnect pass on 3.2.4; current maintenance stays privileged; full-app owned runtime-mode acceptance pending |
| RSC-04 — Combined verification/runbook | blocked | Node 22 lint/typecheck/unit/guarded DB and owned Nitro pass; full production Nuxt bundling OOM; module/full-app/operator gates outstanding |

`done` is local task completion, never release approval. Status values: `todo`, `in-progress`, `blocked`, `done`.

## 3. Evidence recorded on 2026-10-07

Baseline source: `0721bf5782ea6c69a8e0cf1b7689f9fd5edcb56d`; working tree was clean before documentation. Investigation environment: Windows/Git Bash, Node **v24.15.0**, Nuxt **4.4.8**, Nitro **2.13.4**, H3 **1.15.11**, SurrealDB SDK **2.0.3**, tsx **4.22.1**. This session did not run supported Node 22 or a live DB permission test.

### E-01 — Recurring writer ownership rejection (read-only local observation)

`storage/backups/.writer.lock/owner.json` recorded the local host and a PID whose signal-0 probe returned `ESRCH`. No restore journal, uncertainty marker, or ownership guard was found in the inspected backup directory. Receipt contents/tokens/secrets are not copied into these docs. A directory listing is not a complete storage integrity assessment.

`JobStore.startWriter()` calls `take('.writer.lock', writer, false)`. Existing writer ownership is deliberately non-reclaimable, regardless of whether its PID is dead. Repeated startup refusal is therefore explained. Which original crash/shutdown event left the receipt is **not established**.

### E-02 — Plugin rejection leaves admission open (source + isolated actual-plugin reproduction)

Installed `node_modules/nitropack/dist/runtime/internal/app.mjs` calls `plugin(nitroApp)` without awaiting the result. `server/plugins/00-maintenance.ts` awaits `startWriter()` before installing its handler and close hook. `db-init.ts` tests an initially open barrier without awaiting ownership.

Reproduction used the actual maintenance plugin with `defineNitroPlugin` as identity, a synthetic rejecting `startWriter`, a fake Nitro handler/hook recorder, and a one-shot `unhandledRejection` observer. No configured DB or filesystem writer was invoked. Observed:

```json
{"rejection":"synthetic ownership refusal","barrierClosed":false,"maintenanceHandlerInstalled":false,"registeredHooks":[]}
```

This proves the isolated plugin failure path. It is not real Nitro HTTP/process/reload or live database acceptance. A committed automated regression is still required by RSC-01.

### E-03 — Existing targeted tests (unit / owned-process fixtures)

Command executed:

```bash
npm run test:unit -- tests/unit/backup-ownership.test.ts tests/unit/maintenance-crash.test.ts tests/unit/db-lifecycle.test.ts tests/unit/db-reconnect.test.ts
```

Result: **4 files passed, 28 tests passed** on Node v24.15.0. These pre-fix component/owned-crash tests do not test Nitro's full startup coordination. No inference of Node 22, production, Linux durability, or live DB privileges is made.

### E-04 — Environment and credential findings (source / key-presence inspection)

- Local scoped runtime credential keys were absent; values of existing secrets are not documented.
- `credentials(false)` uses DATABASE credentials when both exist, rejects partial configuration, and warns/selects ROOT when both are absent.
- Scoped handshake failure does not trigger ROOT downgrade.
- `nuxt.config.ts` reads legacy development aliases directly. Built Nitro runtime overrides use matching prefixed names; public keys include `PUBLIC` in the name.
- `APP_SPONSOR` initializes `public.appSponsor` at config/build evaluation; its production runtime override is `NUXT_PUBLIC_APP_SPONSOR`.
- `useSiteSettings.ts` and `layouts/default.vue` show that this flag controls only the footer's “Powered by PandaBlog” GitHub attribution.
- The production sample incorrectly uses `APP_SPONSOR=true`; README incorrectly says either missing scoped credential falls back to ROOT. Both documentation corrections are pending RSC-02/03.

## 4. Decisions

| ID | State | Approved contract |
|---|---|---|
| D-01 | approved by user, 2026-10-07 | User will provide scoped runtime credentials; development follows production policy. Both require the pair, with no ordinary runtime ROOT fallback; ROOT remains explicit privileged maintenance only |
| D-02 | approved by user, 2026-10-07 | Rename to `public.footerShowPoweredBy` / `NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY`; initial compatibility proposal is superseded by D-03 |
| D-03 | approved by user follow-up, 2026-10-07 | Add root `.env.example`; retain no deprecated environment-name aliases in development or production |
| D-04 | user bootstrap contract, 2026-10-07 | ROOT provisions only namespace/database/scoped user; scoped identity runs schemas/migrations; ROOT removable before next normal container start. Current privileged backup/restore limitation remains disclosed, not redesigned |
| D-05 | user follow-up, 2026-10-07 | Root example includes `NODE_OPTIONS="--max-old-space-size=4096"`; verify E2E admin username/password loading and consumption |
| D-06 | user follow-up, 2026-10-07 | Do not reprovision existing users on ordinary startup; ROOT remains needed for current backup/restore. Audit all development E2E credentials; do not infer authorization to downgrade ordinary runtime to ROOT |

These decisions supersede the initial recommendations to preserve a development fallback and keep the sponsor name. Approval is for the design, not proof of implementation, credential provisioning, storage recovery or deployment. Identical policy does not mean reusing production secrets locally. Automatic recovery/lock deletion is not proposed.

## 5. Remaining acceptance gates

- [x] Committed failing-then-passing actual-plugin regression using the non-awaiting lifecycle.
- [x] Synchronous request fence, handled bootstrap failures and privately owned boot coordination; component/Nitro fixtures show no unauthorized boot/background work.
- [x] Owned Nitro synthetic-boot start/close/start, failed boot and dev-worker entry handoff; bounded startup/drain/disposal tests. Full Nuxt watcher/full-app init are separate pending gates.
- [x] Existing stale/remote/corrupt ownership and crash/recovery suites pass; actual Nitro failure/uncertainty restart remains fenced.
- [x] Footer rename/empty/strict booleans; actual Nuxt dev config loader and built Nitro public normalization/overrides pass. D-03 replaces compatibility tests with removed-name regressions. Full Nuxt SSR/client rendering is still pending.
- [x] Missing/partial/invalid scoped credentials rejected in both policies before constructor/provisioning; no ordinary ROOT fallback.
- [x] Real stable SurrealDB **3.2.4+20260803.93ab219** privilege matrix and restore current-credential refresh rerun successfully.
- [x] Node **22.22.0** lint/typecheck/unit and owned minimal Nitro production builds pass.
- [ ] Full Nuxt production build (OOM blocker), minimal/optional-module builds, full-app owned startup and SSR/client/watcher acceptance.
- [ ] Linux persistence/mount and actual proxy/container/readiness observations.
- [ ] Operator-approved receipt recovery, environment cutover and deployment; none supplied.

## 6. Session log

### 2026-10-07 — RSC-00 (docs only)

Created the linked plan/progress/operations/spec package and added follow-up notices to existing backend docs so prior component completion is not mistaken for safe startup integration. Local Markdown links and `git diff --check` passed. Application source, user environment, existing receipts/journals, release evidence and historical completion tables were not changed. No new application suite was needed for this docs-only step; E-03 records the earlier investigation run. At this initial handoff, D-01/D-02 were awaiting confirmation; the subsequent decision entry below supersedes that state.

### 2026-10-07 — D-01/D-02 confirmed (docs only)

User confirmed they will provide scoped runtime credentials and want development consistent with production, and approved renaming the sponsor setting. Updated the plan/specs/runbook to require both scoped credentials in both environments without ordinary runtime ROOT fallback, retaining explicit privileged ROOT work. Approved target is `public.footerShowPoweredBy` / `NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY`, with canonical-wins deprecated attribution aliases during migration. This consistency concerns names/policy, not sharing production secrets or DB targets with local fixtures. Decision blockers are resolved; RSC-03 still depends on RSC-01/02 implementation. Documentation links/whitespace and `git diff --check` passed. No application code, `.env`, credentials, storage or test targets were changed. At that docs-only handoff, next eligible task remained RSC-01.

### 2026-10-07 — RSC-01–03 core implementation; RSC-04 verification incomplete

- Baseline application commit: `0721bf5782ea6c69a8e0cf1b7689f9fd5edcb56d`; the RSC documentation and backend follow-up notices were already uncommitted and were preserved. Application changes include `server/utils/startup.ts`, `startup-config.ts`, synchronous `00-maintenance`, coordinated `db-init`/DB close, handshake leases, exact readiness, cron late-close guards, analytics FS/work lease coverage, canonical config parsing/aliases, footer consumers, README and production example. Origin validation moved to a pure shared utility, rather than independently throwing from a plugin.
- First regression: `npm run test:unit -- tests/unit/runtime-startup.test.ts` **failed** against the original actual plugin: `barrier.closed` was false during slow ownership (Node 24.15.0). After implementation it passes on Node 22.22.0, including rejected ownership and the actual `db-init` plugin refusing privileged allocation. This is explicitly a non-awaited loop, not an awaited plugin ordering claim.
- Coordinator tests cover single-flight ownership/boot, ordinary/background denial, private boot queries without deadlock, config/ownership/recovery failures, sanitized logs, partial-boot authority retention, close during acquisition/initialization, late boot after timeout and late disposal without receipt release. Failure policy is a fenced diagnostic service; partial init conservatively persists uncertainty and requires offline review.
- Source inspection of installed Nitro additionally found `DevServer.reload()` starts a new worker without awaiting old close. Development now uses a bounded **5-second / up-to-50-ms** wait for same-process live authority/guard to disappear through clean release, never takeover. `backup-ownership.test.ts` verifies bounded/no-delete wait. `runtime-nitro.test.ts` builds/runs the actual installed `nitro-dev` entry in real Worker threads with the installed shutdown messages, same process PID and different tokens, deliberately overlapping replacement with an active handler. It uses a one-shot bundle with the development NODE_ENV replacement rather than a full Nuxt/Rollup watcher; that distinction remains a pending gate.
- `runtime-nitro.test.ts` also builds a minimal production Nitro server with the actual maintenance/config/readiness code and generated filesystem initialization (not the full application's DB migrations). Actual cached routing, local fetch, auth/setup and normal API denial, two-process contention/no loser boot writes, clean close/start, failed boot/uncertainty recovery and runtime footer canonical false/legacy true/empty rejection pass. Owned IPC-only close control is fixture code, not an application endpoint. No configured DB is contacted.
- `runtime-environment.test.ts` runs actual installed Nuxt `loadNuxtConfig`/dotenv with owned `.env` files and isolated child environments, plus pure precedence/quoting/CRLF/boolean tests. `runtime-identities.test.ts` tests both runtime policies, absent/partial/invalid pairs before client allocation/provisioning, untrimmed passwords, runtime validation and no ROOT downgrade on scoped authentication failure. Production private defaults remain non-secret; build-time success cannot bypass runtime validation. Legacy DB lifecycle fixtures now supply explicit synthetic scoped credentials; logging migration component tests explicitly inject boot coordination and are not relabelled as lifecycle proof.
- Exact tested environment: Windows **10.0.26300**, Node **22.22.0**, Nuxt **4.4.8**, Nitro **2.13.4**, H3 **1.15.11**, SurrealDB SDK **2.0.3**, tsx **4.22.1**, Vitest **4.1.6**, stable DB **3.2.4+20260803.93ab219**. Child PATH/runtime and fixture environments were pinned; all generated roots/processes/DB namespaces were independently owned. No Linux/deployment evidence is implied.

Successful commands/evidence:

```bash
# Run with Node 22.22.0 first in PATH; unset inherited insecure TLS override.
npm run lint
NODE_ENV=production node node_modules/@nuxt/cli/bin/nuxi.mjs typecheck --dotenv=false
npm run test:unit
npm run test:unit -- --maxWorkers=4
npm run test:backend:integration -- --fixture --surreal-bin=<absolute-owned-fixture-binary>
git diff --check
```

- Final default unit run: **106 files passed / 1 skipped; 1,186 tests passed / 16 skipped (1,202 total)**. Bounded-worker run immediately before the two added scheduler close-race cases: **1,184 passed / 16 skipped**, 106 files passed / 1 skipped. Lint/style drift and production-mode typecheck pass without loading the user's `.env`.
- Guarded real SDK/DB integration: **11 files / 19 tests passed**. Permission matrix: runtime CRUD/INFO/table DDL permitted, user and database provisioning denied; dedicated ROOT kept separate. Full/partial restore commits and incremental rollback retain current credential refresh/reopened runtime behavior. These are disposable integration tests, not full Nuxt application startup or production acceptance.
- Failed attempts retained: initial highly parallel unit run concurrent with typecheck had the existing Japanese annotation 5-second timeout and media abort/deadline timing failure; later default and bounded runs passed without changing those tests/timeouts. Early fixture runs caught Windows handler-path escaping, default polling timeout, invalid-public-config breaking liveness, and the dev bundle's production NODE_ENV replacement; fixes are in the committed regressions/code, not hidden as passing results.
- Full production build attempt: `NODE_ENV=production node node_modules/@nuxt/cli/bin/nuxi.mjs build --dotenv=false`. First attempt timed out at 240 seconds during Nitro bundling. Retried with a 600-second command budget: client/server compilation completed, but Nitro bundling exited **134** with **default ~4 GiB heap OOM** after about 302 seconds. Existing Tailwind sourcemap, package-export, es2019 bigint and Rollup annotation warnings were also emitted. No heap-limit increase or unrelated bundler rewrite was applied. This blocks full production/minimal/optional-module build and full Nuxt application smoke evidence.
- Updated operator guidance and local Markdown link/whitespace checks; alias cutover, existing receipt recovery, deployment, Linux persistence, actual containers/proxy/browser and production-copy rehearsal remain independently pending. No user `.env`, existing storage or configured service was changed or started. Next eligible work is the build/full-app acceptance blocker, not operator recovery.

### 2026-10-07 — D-03: root example and no deprecated aliases

User explicitly requested a root `.env.example` and no deprecated aliases. This supersedes the earlier compatibility-retention proposal and implementation described in the historical session above.

- Added root `.env.example` with all canonical DB/ROOT/scoped/session/origin/footer fields, optional MFA/GeoIP, unchanged logging process variables and local-only guidance. Required secrets are deliberately empty in both root and production examples. README quick start now instructs `cp .env.example .env`; the user's real `.env` was not read or modified.
- Removed alias parameters/lookup from `resolveEnvironment`, switched every `nuxt.config.ts` lookup to explicit canonical names, and removed `NUXT_PUBLIC_APP_SPONSOR` from footer runtime normalization. Old unprefixed application variables and both old sponsor names have no effect in development or production; there is no retained compatibility fallback.
- Updated plan/spec/runbook for the breaking canonical-only contract. Operators must migrate old environment names before upgrading; credential cutover and deployment still require independent authorization.
- Updated actual Nuxt dotenv/config tests to prove old DB/origin/MFA/GeoIP/footer names are ignored, with process/file/default and explicit-empty checks. Built Nitro tests now toggle only the canonical footer name and verify legacy-only attribution stays false. Added template completeness/empty-secret tests. Old-name strings remain only in negative tests and migration/historical docs, not application lookup code.
- Node **22.22.0** / Nuxt **4.4.8** / Nitro **2.13.4** / H3 **1.15.11**, Windows: lint/style drift and `NODE_ENV=production node node_modules/@nuxt/cli/bin/nuxi.mjs typecheck --dotenv=false` pass. `npm run test:unit -- --maxWorkers=4`: **106 files passed / 1 skipped; 1,187 tests passed / 16 skipped (1,203 total)**. Local Markdown links and `git diff --check` pass. Initial combined targeted run had a dev replacement readiness polling failure; isolated rerun and full bounded suite passed without changing handoff/poll/drain deadlines. This intermittent dev-fixture observation remains recorded, not hidden.
- No new DB SQL or configured service startup was involved; full Nuxt bundling OOM and full-app/module/operator gates from the prior session remain unresolved. No build success or deployment is inferred from this follow-up.

### 2026-10-07 — D-04/D-05: bootstrap-only ROOT, scoped schema and E2E variables

- Added root-template `NODE_OPTIONS="--max-old-space-size=4096"` and optional empty `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD`. Native Node flags must be injected/exported before launch; `.env` loading after process start does not resize that running heap. Production's independently documented 1024 MiB setting is unchanged. This is not evidence that the prior default-heap full Nuxt build blocker has been resolved.
- Verified the Playwright configuration still loads those exact E2E process names and the authenticated specs consume them. Extracted a robust Node dotenv loader preserving process > `.env.e2e.local` > `.env.e2e` > `.env.local` > `.env`, explicit-empty behavior, quoting/hashes/comments/CRLF. Removed the remaining `APP_LOGIN_USERNAME` fallback from two authenticated specs. `e2e-environment.test.ts` imports the actual Playwright config in an isolated child with owned files; no app server/browser is launched. Real application-account login/E2E browser acceptance was not run, and no existing credential values were read or displayed.
- Reproduced the old bootstrap privilege boundary before changing it: `npm run test:unit -- tests/unit/logging-excluded-paths-migration.test.ts -t 'merges on'` failed because mandatory boot migration queries received the ROOT client instead of scoped pool. The changed regression and existing receipt/cache migration suites now pass with scoped boot authority.
- Implemented `initializeRuntimeDatabase()` in `server/utils/db.ts`: validate scoped/target config, optionally use explicitly supplied ROOT credentials for `DEFINE NAMESPACE`, `DEFINE DATABASE`, and `DEFINE USER` only, verify ROOT disposal, then authenticate scoped. `db-init.ts` now performs ALL normal boot schema/migrations/recovery with that scoped client. Missing ROOT password skips bootstrap; an already-provisioned user works without ROOT, while failed scoped auth never retries as ROOT. Existing ROOT secrets in the running environment are not erased by socket close; recreate/restart without the password after successful provisioning. Keeping bootstrap credentials configured explicitly reprovisions on subsequent starts.
- Added sanitized missing-ROOT validation for privileged SDK and HTTP maintenance, before client/network/file-stream allocation. Current backup/export/import/staging/restore still needs privileged credentials (staging DB creation and restored-user refresh); it is not silently substituted with EDITOR. A fully ROOT-free maintenance architecture remains separate work. Namespace/database identifiers are validated before interpolated DDL. No actual deployment credentials, user's `.env`, configured DB or existing storage were modified.
- `database-bootstrap.test.ts` covers exact ROOT-only DDL, disposal before scoped sign-in/schema, ROOT-free reconnect, failed provisioning/auth/disposal, identifier validation and privileged maintenance refusal before network allocation. `tests/integration/database-bootstrap.test.ts` executes the actual full shipped schema on an owned stable DB: ROOT creates **0 tables**, DATABASE EDITOR creates **31 tables**, data survives schema reentry after ROOT removal and scoped reconnect, and user provisioning remains denied. The first live run passed schema/reconnect assertions but its evidence reporter queried `version()` after the intentionally denied user-DDL path discarded the runtime socket; the reporter was moved before denial, without changing application auth-rejection behavior.
- A final full unit attempt also reproduced the earlier intermittent dev-worker handoff issue: replacement polling briefly owned `.ownership.guard` when previous `stopWriter()` attempted release, causing conservative close refusal. Fixed the dev wait to use a non-authoritative read while a same-process receipt exists; it no longer repeatedly occupies the guard during old close. Actual acquisition still uses the guarded token/generation protocol, with the same 5-second budget and no takeover. The regression asserts no guarded acquisition attempt while the old live receipt remains. Forced/uncertain/corrupt/remote authority remains fail-closed.
- Exact local runtime remains Windows **10.0.26300**, Node **22.22.0**, Nuxt **4.4.8**, Nitro **2.13.4**, H3 **1.15.11**, SDK **2.0.3**, stable SurrealDB **3.2.4+20260803.93ab219**. Final `npm run lint`, production-mode `typecheck --dotenv=false`, `npm run test:unit -- --maxWorkers=4`, doc-link and diff checks pass: **108 files passed / 1 skipped; 1,199 tests passed / 16 skipped (1,215 total)**. Guarded integration command passes **12 files / 20 tests**, including the new full-schema ROOT-free regression and existing restore/credential refresh/permission suites. Only owned generated targets and processes were used.
- Full Nuxt build/module/full-app SSR/browser/proxy/Linux/deployment gates remain pending. No automatic receipt recovery, secret rotation, configured app startup, user-account provisioning or production acceptance is implied.

### 2026-10-07 — D-06: create-if-missing bootstrap and complete local E2E audit

- User reconsidered removing ROOT because current backup/restore needs it, questioned scoped identity's value, and requested checking all development tests. No ordinary runtime ROOT downgrade was requested/implemented. Scoped EDITOR still constrains query/SQL-injection exposure to its database and denies user/database provisioning; it does not contain RCE/environment theft while ROOT is available to the same process. Templates/README/runbook now recommend retaining ROOT for current full-feature backup/restore instead of describing removal as the general deployment step.
- Normal bootstrap now uses `DEFINE USER IF NOT EXISTS`, not `OVERWRITE`: existing passwords/roles are preserved even when ROOT stays configured. A changed/mistyped runtime password fails scoped authentication rather than silently resetting the account. Fresh target/user creation still works. `provisionAppDatabaseUser()` retains deliberate overwrite by default for explicit restore credential refresh; normal bootstrap opts out. This keeps current restore safety/credential-refresh behavior independent from normal startup.
- First regression: the unit assertion expecting create-if-missing failed against the prior `DEFINE USER OVERWRITE` startup. After the change, unit tests distinguish normal bootstrap from privileged refresh. Real **SurrealDB 3.2.4+20260803.93ab219 / SDK 2.0.3** regression proves an existing scoped user survives a mistyped configured password with ROOT retained; restoring the original configured password authenticates again. The 31-table scoped-schema and optional ROOT-free ordinary reconnect cases remain passing, along with real full/partial restore and incremental rollback.
- Audited **all 25 physical development E2E spec files**, including files ignored by Git. **23** use canonical `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` for real account authentication; the other two are anonymous responsive layout and explicitly mocked dialogue UI coverage. User-management cases deliberately generate credentials for test-created accounts; those are not substitutes for the configured admin login. Unit/DB integration suites intentionally keep independent owned fixture credentials, not the E2E admin account.
- Found and removed **9 additional `APP_LOGIN_USERNAME` fallbacks** in local ignored specs: `admin-post-refresh-auth`, `admin-users-management`, `block-editor`, `editor-toolbar-layering`, `media-library-selection-search`, `multilang`, `private-site-login`, `mobile-native-layout`, and `related-post-picker`. These local spec files remain Git-ignored; their one-line local edits are not new tracked patch files, and the repository's selective E2E tracking policy was not broadened. Added a durable tracked unit audit scanning every available physical spec so a reintroduced fallback fails locally rather than being missed by a tracked-only scan.
- Found two code-block cases missing the empty-credential guard; moved it into that local ignored file's `beforeEach` so all three cases skip before login work without the pair. No existing E2E account password, login-session state or configured application data was read or changed.
- Added actual Playwright `--list` collection from an owned temp cwd/environment. It loads/collects **76 test cases in 25 spec files** without starting any app/browser or contacting the loopback placeholder. Credential loader process/file precedence and actual Playwright config tests remain passing. Source/collection evidence is not a claim that all browser/auth/role/API workflows pass on a running deployment.
- Node **22.22.0**, Windows: lint/style drift, production-mode `typecheck --dotenv=false`, `npm run test:unit -- --maxWorkers=4`, local links and `git diff --check` pass: **108 files passed / 1 skipped; 1,202 tests passed / 16 skipped (1,218 total)**. Targeted owned DB run with `vitest.backend.config.ts` for `database-bootstrap.test.ts` and `backup-restore.test.ts`: **2 files / 4 tests passed**. No configured app/DB, real E2E account, credential rotation, storage recovery or deployment was used. Full build/browser/module/Linux/operator gates remain pending.

### 2026-10-07 — Repeated fenced startup investigation

- User reported continued 503s after removing writer ownership. Read-only filesystem inspection found an uncertainty marker from 23:18, independently blocking subsequent initialization; removing a writer receipt cannot clear persisted recovery or an already-failed in-memory coordinator. The current marker/receipt were left untouched in this follow-up.
- An independent configured-endpoint sign-in diagnostic established that transport connects but both configured ROOT and DATABASE identities are rejected at authentication. No SQL, provisioning, migrations or credential reset ran in that diagnostic. Private comparisons confirmed bundled DB settings match the canonical local file; no passwords, endpoint or owner tokens are reproduced here. This is a confirmed current authentication blocker, not proof of the original failure's complete mutation history or DB consistency.
- Fixed the inner restore middleware masking `/api/ready` by sharing exact diagnostic exceptions with the outer handler. Readiness now returns an expected no-store 503 and sanitized failure category rather than triggering error-page SSR. Fenced ordinary requests return a minimal 503 directly; `/__nuxt_error` remains blocked without recursively invoking Nuxt's error renderer or DB error logging. Startup and DB handshake diagnostics distinguish identity/stage using allow-listed metadata, never raw causes.
- Added regressions for both maintenance layers, direct fence responses without error-render hooks, handshake stages/no SQL after rejected sign-in, sanitized startup diagnostics and persisted recovery. The actual production Nitro/dev-worker fixture now includes the inner restore middleware and verifies recovery readiness.
- Node **24.15.0**, Windows: **109 unit files passed / 1 skipped; 1,210 tests passed / 16 skipped**. Production-mode `npm run typecheck -- --dotenv=false`, changed-file ESLint and `git diff --check` pass. Requests to the running configured dev service confirm correct readiness recovery JSON and single clean login 503, **not successful boot or browser login**. Authentication correction and approved offline consistency/recovery remain prerequisites; no live-data recovery or unfence is claimed.

### 2026-10-08 — D-07: routine startup failures no longer require offline recovery

- User approved the narrow simplification: separate verified pre-mutation failures from partial/uncertain execution, keep failed services fenced, and provide understandable guidance/local recovery assistance. This does not authorize operating on the user's DB, changing secrets or archiving live recovery records.
- DB execution evidence is monotonic: dispatch of any non-read-only query or handoff from database initialization to application migrations/FS work ends the pre-mutation window. Only an actual handshake error registered in an internal WeakSet can prove this narrow class; arbitrary error strings/statuses/metadata cannot forge it. ROOT sign-in rejection before SQL is retryable after verified cleanup; scoped rejection **after ROOT provisioning** remains partial initialization.
- The coordinator single-flights disposal and bounds failure cleanup at 5 seconds. Verified pre-mutation failures dispose every owned client, require zero active/uncertain leases and token/generation-verified writer release, create no uncertainty marker and never publish readiness. Unknown failures, partial work, unclosed/pending clients, failed release and late disposal after its deadline retain authority. Configuration failure remains pre-ownership with no new marker. Existing legacy markers are not reclassified or silently cleared.
- `stopWriter()` now reports verified release, rechecks persisted recovery under the exclusive guard and cannot claim success for a replaced receipt. Browser 503s use a static, escaped maintenance explanation without SSR/DB work; unavailable readiness/API responses include sanitized guidance.
- Added `npm run recover`: read-only local inspection without `.env` loading/DB access/token output, plus explicit operator-reviewed **startup-only** archival under the application guard. The assistant cannot establish server execution quiescence/data consistency; it requires operator assertions and preserves exact receipts plus a review record in an ignored archive. Live/remote/corrupt/unrecognized/mismatched ownership, existing guard/job, and any restore journal/artifacts refuse archival. No restore-resume/import/rollback, public unfence, automatic PID/TTL takeover, or migration retries were added.
- New owned-storage/mock-DB regressions cover corrected start after rejected pre-mutation sign-in, provisioning-before-scoped-failure, disposal failure/deadline, active work, forged evidence, legacy-marker preservation, reader/archival bounds, unsafe ownership, symlink roots, competing recovery contenders, no DB/media/setup changes, and actual CLI read-only behavior. Actual production Nitro plus dev-worker fixtures prove clean pre-mutation connection failure/restart and retained partial-failure recovery with both maintenance layers.
- Windows **Node 24.15.0**: production-mode typecheck, full lint/style drift and diff checks pass; a complete rerun reports **111 files passed / 1 skipped; 1,241 tests passed / 16 skipped**. The first full run had one unexpectedly exiting Vitest fork; cause is not established, and it was not treated as acceptance. A verbose full rerun passed with no unhandled errors, followed by another complete passing run on available cached **Node 24.21.0** (same counts). Supported Node 22, Linux/crash durability, real DB/full-app boot/browser acceptance remain separate gates. Implementation tests used only generated/owned fixtures; the existing configured DB, `.env`, uncertainty marker and writer receipt were not changed by this implementation.

### 2026-10-08 — Empty writer-directory recovery follow-up

- User's recovery assistant refused ownership. Read-only inspection established that `.writer.lock` was a regular **empty directory**, not an unreadable JSON receipt: `owner.json` was absent. Its original owner/publication/removal history cannot be determined from that absence; no automatic quiescence inference is made.
- Added a narrow operator-reviewed empty-directory path. Inspection explains missing metadata; archival still requires all external stopped-writer/database-quiescence/data-consistency confirmations, rejects any active guard/job/restore evidence or nonempty corruption, rechecks emptiness under the exclusive publication guard, and preserves the directory plus an explicit review record. No user records were archived by this follow-up.
- Owned-fixture tests cover empty ownership with/without uncertainty, every missing confirmation, preserved archival evidence, guard refusal and nonempty partial-publication refusal: **18 assistant tests pass**, changed-file ESLint and diff checks pass. Read-only real-directory CLI verification is distinguished from any actual recovery or successful application boot.

### 2026-10-08 — Normal-user recovery UX correction

- User correctly objected that ordinary users cannot certify database execution quiescence or DB/media consistency. The previous interactive questions were expert assertions, not automated verification. Removed them; reviewed archival is now explicitly expert-only with all assertion flags, never presented as a normal-user guessing exercise. Unknown legacy execution still cannot be automatically certified or force-cleared.
- Current read-only inspection found changed live state: the uncertainty marker was absent, the writer receipt was valid with a live local process, and `/api/ready` returned HTTP 200 with `ready: true`. This is current readiness evidence, not proof of historical consistency or an agent-performed restore. No current receipt or application process was changed by this follow-up.
- Normal live ownership with no recovery markers now reports `writer-active` informationally rather than `manual-recovery-required`. A live PID alone does not claim readiness; the report directs users to `/api/ready` and never archives active ownership. Live ownership combined with uncertainty/restore blockers still refuses archival. Added live-owner/no-marker preservation and actual CLI no-question regressions.
