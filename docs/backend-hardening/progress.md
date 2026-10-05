# Backend review corrections: progress

> Read this first in every session. Tasks are in [plan.md](./plan.md), requirements in [specs](./specs/00-architecture.md), and baseline evidence in [findings.md](./findings.md).
> Update this file after every task: status, evidence, decisions, remaining gates and session log. Do not rewrite the plan to track progress.

## Current state

- **Next task:** REV-1.1. Phase 0 is complete locally; REV-1.3, REV-1.4 and REV-1.6 are also eligible security lanes, respecting shared-file ownership. See [harness.md](./harness.md) for guarded fixture commands.
- **Implementation:** REV-0.0 and REV-0.1 are `done` locally. Foundation tooling, unit reproductions and real SDK/HTTP acceptance are in place; no application hardening behavior/schema changes have shipped.
- **Review baseline:** source revision `067fb64f5654e45668b29bcaaf7346eb12576c0a`, branch `main`; captured 2026-10-05 UTC.
- **Environment:** review used Node v24.15.0. REV-0.1 pins/tests **Node v22.22.0**, Windows/Git Bash; SDK 2.0.3, Nuxt 4.4.8, Sharp 0.34.5. User approved stable **SurrealDB 3.2.x**; real **3.2.4+20260803.93ab219** two-start/transaction/HTTP import acceptance now passes. CI/default artifact pin is 3.2.4. Original 3.2.5 availability/refusal observations remain historical below.
- **Existing safeguards:** retain docs/logging's completed local work and its separate production gates. This package does not reopen or overwrite its history.
- **Unrelated workspace state:** pre-existing untracked `pandablog-latest.tar.gz` left untouched; no application code, `.env`, configured DB or existing storage modified by this handoff.
- **Release status:** not approved. Application hardening implementation and every operator release gate remain pending; Phase 0 local completion is not deployment authorization.
- **Blockers:** no remaining Phase 0 DB/runtime blocker after the user's target amendment. Default-parallel units still encounter the pre-existing `annotate.test.ts` Japanese dictionary 5-second timeout (bounded-worker suite passes; exception explicitly recorded). Approved production-copy rehearsal remains an eventual REV-5.3 operator gate.

## Task status

| ID | Title | Status | Date | Notes |
|---|---|---|---|---|
| REV-0.0 | Review evidence and handoff documents | done | 2026-10-05 | Docs only; findings and prior test/reproduction scope recorded |
| REV-0.1 | Isolated regression/runtime harness | done | 2026-10-05 | Local Node 22.22.0 / approved stable DB 3.2.4; two starts, SDK commit/cancel, streamed import, separate RSS; no release approval |
| REV-1.1 | Revocable identity and owner authorization | todo | — | Legacy-cookie invalidation must be coordinated with schema/writers |
| REV-1.2 | MFA, setup and browser mutations | todo | — | Depends on identity and limiter |
| REV-1.3 | Atomic limiter and bounded KDF work | todo | — | Real expiry and admission backend decision required |
| REV-1.4 | Shared SSRF-safe outbound transport | todo | — | Mapped IPv6 reproduction already recorded; transport fix not started |
| REV-1.5 | Private media and authorized ZIPs | todo | — | Archiver compatibility and privacy fixes ship together |
| REV-1.6 | Remove destructive startup reset | todo | — | Preserve historical/missing-marker media |
| REV-2.1 | DB lifecycle, deadlines and retries | todo | — | Verify actual installed SDK cancellation/3.2.x permissions |
| REV-2.2 | Maintenance barrier and crash-safe ownership | todo | — | Requires writer inventory and durable recovery state |
| REV-2.3 | Stream snapshots/imports/consolidation | todo | — | App and DB memory measured separately |
| REV-2.4 | Restore consistency and archive safety | todo | — | Partial-table replacement, empty media, rollback, variants |
| REV-3.1 | Streaming uploads and image admission | todo | — | Count/byte/pixel/disk/queue limits |
| REV-3.2 | DB-paginated media and safe search | todo | — | No full-table page materialization or unrestricted Node regex |
| REV-3.3 | Atomic publication and claimed cleanup | todo | — | All reference writers must honor claim state |
| REV-4.1 | Bounded analytics/session/live reads | todo | — | Exact distinct strategy and datetime behavior need evidence |
| REV-4.2 | Analytics publication/checkpoint/retention | todo | — | No raw purge before verified publication |
| REV-4.3 | Byte-bounded log reader and stats | todo | — | Preserve truncation, receipts and file safety |
| REV-4.4 | Global log admission and truthful retention | todo | — | Global distinct-key/queue limits and incomplete reports |
| REV-4.5 | Bounded graph and scope-safe cache | todo | — | Privacy-filter in DB; cap expansion/cardinality |
| REV-4.6 | FTS lifecycle and corpus rebuilds | todo | — | Preserve CJK semantics; isolate one-time destructive migrations |
| REV-4.7 | Public caches/input/runtime consistency | todo | — | Real Nitro storage/SSR privacy validation required |
| REV-5.1 | Combined security/fault/scale verification | todo | — | All local implementation lanes prerequisite |
| REV-5.2 | Final operations/deployment docs | todo | — | Current operations.md is explicitly draft |
| REV-5.3 | Operator rehearsal and release acceptance | todo | — | No production permission/evidence supplied |

Status values: `todo` · `in-progress` · `blocked` · `done` · `skipped` (with a reason). Local completion and release approval remain separate.

## Baseline checks (preceding review, not rerun after fixes)

| Check | Observed result | Evidence scope |
|---|---|---|
| `npm run test:unit` | **891 passed / 16 skipped; 63 files passed / 1 skipped** | Node 24.15.0; opt-in live DB suite not enabled |
| `npx eslint server --quiet` | pass | Server lint only, not full npm run lint |
| `npm run typecheck` | pass | Available Node 24 runtime |
| Shared SSRF classifier | Mapped loopback/metadata and `fe90::1` incorrectly allowed | Real helper, no outbound connection |
| Limiter concurrency | 20/20 admitted with limit 1, stored count 1 | Deterministic async fake-store reproduction |
| Unstorage fs ttl | Value retained after 1-second TTL + 1.2-second wait | Real installed driver, owned temp directory |
| Archiver 8 invocation | Namespace object; factory call throws TypeError | Real installed runtime exports |
| Node 22 / real SurrealDB 3.2.5 / production build | not run | Required future evidence, not implied by above |

Detailed reproduction contracts and confidence are in [findings.md](./findings.md). All **F-01–F-27 remain open**; some contain explicitly labelled validation hypotheses, not reproduced runtime failures. REV-0.1 adds durable F-04/F-05/F-06/F-14 `it.fails` reproductions on Node 22; these are intentional expected failures, **not fixes**. New evidence is in the session log below, distinct from the review baseline.

## Resource baseline and after-change measurements

Do not fill these from historical logging numbers or estimates. Record actual fixture/profile/version with each observation.

| Metric / workload | Baseline at target runtime | After correction | Evidence/task |
|---|---|---|---|
| Idle app RSS / DB RSS / CPU profile | Fixture DB idle 108,101,632–108,290,048 bytes; Nitro app/CPU profile pending | pending (no app correction) | REV-0.1 real smoke below / REV-5.1 |
| Large SQL restore app/DB peak RSS and elapsed | pending | pending | REV-2.3 / REV-2.4 |
| Concurrent upload/KDF RSS and queue high-water | pending | pending | REV-1.3 / REV-3.1 |
| Media page latency/transferred rows at scale | pending | pending | REV-3.2 |
| Analytics raw/cardinality scale RSS and latency | pending | pending | REV-4.1 / REV-4.2 |
| Busy-day log reader/stats RSS, scanned bytes | pending | pending | REV-4.3 |
| Distinct-error storm pending bytes/keys/drops | pending | pending | REV-4.4 |
| Graph/CJK rebuild query plans, RSS and results | pending | pending | REV-4.5 / REV-4.6 |
| Cookie/key churn cache bytes/keys after expiry | pending | pending | REV-4.7 |
| Actual deployed 24-hour/overnight results | pending | pending | REV-5.3 |

## Decisions / deviations

- **2026-10-05 · REV-0.0:** use `docs/backend-hardening/` and `REV-*` task IDs, mirroring logging's plan/progress/spec structure. Existing logging progress and application source remain unchanged.
- **2026-10-05 · REV-0.0:** preserve original evidence levels. The ZIP permission omission is a source-confirmed latent defect behind the reproduced Archiver 8 factory error, not a claimed successful live exfiltration.
- **2026-10-05 · REV-0.0:** baseline tests ran on Node 24, not the requested Node 22. No live 3.2.5 verification was performed. Historical 3.2.4 logging tests remain historical evidence only.
- **2026-10-05 · REV-0.0:** initial target is one app writer with bounded local admission, not a mandatory Redis/worker-pool infrastructure expansion. New budgets in spec 00 are proposed defaults to measure, not production measurements.
- **2026-10-05 · REV-0.0:** choose an opaque random per-account auth epoch as the target so deleting/recreating a username cannot revive an old counter-zero session. Legacy cookies deliberately reauthenticate on migration.
- **2026-10-05 · REV-0.0:** extra backup safety checks (partial replacement semantics, archive entry types, response validation and empty-media behavior) are explicit regression/validation work; the handoff does not assert a new live reproduction of all of them.
- **2026-10-05 · REV-0.0:** require core changed-SQL acceptance on real 3.2.5 before the relevant task is locally done. Production-only gates can remain pending after local completion; an unavailable core integration environment is a blocker, not an automatic exception.

- **2026-10-05 · REV-0.1:** keep SurrealDB 3.2.5 as a strict local acceptance blocker; do not substitute the available 3.2.4/3.3.0 releases or bypass version checks. Official GitHub `v3.2.5` returns 404; Docker Hub `surrealdb/surrealdb:v3.2.5` returns `manifest unknown`. Continue no dependent task while this prerequisite is blocked.
- **2026-10-05 · REV-0.1:** pin Node 22.22.0 in `.node-version`; launch an explicit absolute DB executable with memory storage, generated loopback targets/credentials and owned temp receipts. No external-target/storage options and no `.env` inheritance. Legacy fixed-port/static-credential live tests now use this owned harness.
- **2026-10-05 · REV-0.1:** default units preserve six open-finding secure-contract tests as `it.fails`; an unexpected pass requires the owning task to remove the annotation. They are reported separately from passing regressions and do not close findings.
- **2026-10-05 · REV-0.1:** unignore the new tooling/tests and the previously ignored CI workflow. Replace that workflow's ignored, `.env`-loading/app-server-reusing mutation Playwright invocation with an explicit deferred browser gate, rather than ship a default unsafe/broken test target. REV-5.1 must supply guarded Nitro/browser/module acceptance. The exact-3.2.5 CI job is manual opt-in and cannot silently pass on an unavailable release.

- **2026-10-05 · REV-0.1, user-authorized amendment:** user explicitly permits **SurrealDB 3.2.x**, superseding the strict 3.2.5 target/blocker above. Use official stable **3.2.4** as the reproducible CI/default fixture pin, accept stable 3.2.x binaries, reject prereleases/other minors, and record the exact CLI/SDK version in every real run. This applies to all remaining REV changed-SQL acceptance; it is not a waiver of live DB evidence or any release gate. Historical 3.2.5 observations remain as history.

## Open implementation decisions

Resolve within the owning task, using specs and evidence; do not block docs handoff on these:

1. REV-1.3: bounded local limiter versus atomically persisted backend; restart and legacy-file cleanup policy.
2. REV-2.1: supported SDK/server cancellation mechanism, foreground/background admission defaults, exact required privilege matrix.
3. REV-2.2: atomic lock/reclamation/journal protocol and narrowly scoped status authorization while DB is unavailable.
4. REV-2.3: expanded SQL/media and disk reserve defaults based on separate Node and SurrealDB import measurements.
5. REV-3.2/3.3: supported regex replacement, query indexes, publication/deletion claim schema and private dedup behavior.
6. REV-4.1/4.2: exact distinct implementation, repair window and summary generation publication contract.
7. REV-4.3/4.4: additive incomplete/count-known response fields and consumers; best-effort activity overflow policy.
8. REV-4.5/4.6/4.7: bounded graph contract, generation/cache invalidation mechanism and verified CJK index strategy.

## Pending verification / release gates

- [x] REV-0.1: Node 22.22.0 and user-approved stable DB 3.2.4 tested; guard/lifecycle/streaming tests and **real two-start/transaction/HTTP import/separate driver+DB RSS acceptance pass locally**. No configured targets accepted. See [harness commands and safety scope](./harness.md).
- [ ] Changed auth, media, database, backup, analytics and logging regressions exercised at their required evidence tier.
- [ ] Full `npm run lint`, typecheck and default unit suite on Node 22; production build and optional-module matrix.
- [ ] Linux symlink/fsync/rename/disk-full behavior; Windows skips are not passes.
- [ ] Real Nitro/browser/proxy cache/CSRF/private-media behavior; en/zh-CN smoke and SSR isolation.
- [ ] Mixed-load resource measurements and crash/fault matrix on explicit CPU/memory/disk limits.
- [ ] Approved production-copy rehearsal, verified backup/rollback and no old/new writer overlap.
- [ ] Operator authorization, deployed privacy/auth checks, actual 24-hour/overnight maintenance observations.
- [ ] Existing [logging production gates](../logging/progress.md#pending-manual-verification) reviewed and reconciled rather than silently assumed complete.

## Session log

### 2026-10-05: REV-0.0 (done; documentation only)

- Read the logging plan, architecture, operations, representative specs and progress decisions/session format. Created a separate handoff package with plan, finding register, progress, draft operations and specs 00–09.
- Recorded 27 finding IDs, source locations/triggers/confidence, baseline command outcomes and safe reproduction contracts. Added 25 task entries with dependencies, deliverables, acceptance criteria and coordinated deployment boundaries.
- Defined current-identity epochs, SSRF pinning, real expiry/KDF admission, privacy-safe media, bounded streams/queries, maintenance ownership/journal, safe migrations and verification/release contracts. These are specifications, not implemented features.
- No production or configured-DB operations, source fixes, runtime setting changes or application test rerun in this docs-only task. Prior review's 891/16 tests and focused probes are recorded separately above.
- Documentation validation: a Node-based check passed for all **14 Markdown files**, relative links/anchors, whitespace, **25 unique task IDs**, plan/progress status coverage, **27 finding IDs**, and an acyclic dependency graph. Status count: **1 done (documentation), 24 todo**. `git diff --check` also passed; because the new directory is untracked, its whitespace was checked explicitly by the Node validator. Python was unavailable, so validation used the installed Node runtime.
- Next: REV-0.1. Implementer should read this file first, then plan/spec 00/spec 09, and add durable isolated regressions before fixing runtime behavior.

### 2026-10-05: REV-0.1 (blocked; tooling local, no release approval)

- Baseline revision remains `067fb64f5654e45668b29bcaaf7346eb12576c0a`. Read progress, plan, specs 00/09, findings and logging safeguards. No application code/schema fixes, `.env` target operations, existing storage/data changes, archive inspection or logging-history rewrite. REV-0.0 was the only satisfied prerequisite.
- Added `scripts/backend-hardening/{fixture,generate,http,run}.ts`, `.node-version`, `vitest.backend.config.ts`, `tests/helpers/backend-hardening.ts`, three new unit files and `tests/integration/backend-hardening.test.ts`; updated package command, CI, ignore exceptions and existing `error-groups-live.test.ts`. Usage/safety/evidence scope is documented in [harness.md](./harness.md).
- Smallest harness test initially failed to import the not-yet-created tooling on Node 22. Then implemented strict runtime/opt-in/loopback/name/path/env guards; generated credentials; bounded owned-process lifecycle; receipt-verified temp storage; byte-bounded HTTP/disposal; chunked, exclusive, abortable SQL generation. Mocked start/stop twice, wrong-version and spawn-failure cleanup use real owned temp FS; they are **unit evidence**, not a live DB pass. Real acceptance code commits/cancels transactions, streams HTTP import, verifies rows, records separate driver/DB memory and repeats with new targets. It remains unexecuted on 3.2.5.
- F-04/F-05/F-06/F-14 reproduced by durable tests on installed helpers/packages: three IPv6 classifier cases (no connections), a 20-arrival limit-one rendezvous, untouched filesystem TTL after 1.2 s, and actual Archiver factory invocation. Six `it.fails` cases remain expected failures; **all findings stay open**. No two-file ZIP/privacy repair is claimed.
- Runtime: official Node `v22.22.0/win-x64/node.exe`, SHA-256 `bae898add4643fcf890a83ad8ae56e20dce7e781cab161a53991ceba70c99ffb`, verified against Node's published SHASUMS. Child `PATH` was pinned too. Windows `10.0.26300`, 16 logical CPUs, host RAM 34,048,368,640 bytes; installed SDK 2.0.3 / Nuxt 4.4.8 / Sharp 0.34.5 / Vitest 4.1.6 / unstorage 1.17.5 / Archiver 8.0.0. This unconstrained host is **not** spec 09's scale profile.
- Commands/evidence: focused guard/lifecycle/baseline suite passes (final counts below); `npm run lint` and `npm run typecheck` pass on Node 22. Default `npm run test:unit` twice hit the known unrelated Japanese dictionary 5 s timeout: **901 passed / 6 expected fail / 16 skipped / 1 failed**. `npm run test:unit -- --maxWorkers=4` passed **902 / 6 expected fail / 16 skipped**, before the final pin-synchronization test was added; final check recorded below. No dictionary code/timeouts or default worker settings were changed.
- Live blockers: official GitHub tag API and Windows 3.2.5 asset returned 404; Docker Hub manifest inspection returned `manifest unknown`. The actual official 3.2.4 binary reports `3.2.4+20260803.93ab219 for windows on x86_64`; guarded integration refused it **before starting a server** (both live files fail on version guard). No-argument integration command refuses execution. Config inspection confirms only the two intended live files are included; no full-unit-array merge. These are refusal/selection checks, not DB acceptance.
- Measurements: a standalone Node 22 metadata probe reported RSS **49,598,464**, heapUsed **4,610,216**, external **1,647,117**, arrayBuffers **10,511** bytes. This is **only a plain test-driver sanity observation**, not an idle Nitro app/DB baseline. Real app/DB RSS, CPU, import memory/time and scale measurements remain pending; no seed OOM or retention measurement occurred.
- Final checks: Node 22.22.0 `npm run lint`, `npm run typecheck`, and `npm run test:unit -- --maxWorkers=4` pass: **66 files passed / 1 skipped; 903 passed / 6 expected fail / 16 skipped (925 total)**. Focused runs on Node 22.22.0 and supplementary Node 24.15.0 each pass **12 / 6 expected fail, 3 files**. `git diff --check` passes; new paths are explicitly unignored; CI YAML/Node pin/manual opt-in parse passes. A Node validator checks **27 files** for whitespace, **40 relative doc links**, and all **25 task-status entries**. Default-parallel timeout results above remain recorded, not converted into passes. No real CI, app startup, browser or DB success is inferred.
- Remaining gates: actual 3.2.5 two-start/SDK/HTTP import/RSS, CI execution, isolated Nitro/browser/proxy/module builds, Linux filesystem cases, scale/fault matrix and every operator release gate. Local tooling does not approve production. All dependent tasks are ineligible; next action is an authorized target-version availability decision or supplying the exact required binary, then rerun the documented command. Do not silently change the target.

### 2026-10-05: REV-0.1 (done locally; user-approved 3.2.x follow-up)

- User explicitly authorized stable **SurrealDB 3.2.x**. Updated spec 00/spec 09 and plan runtime contracts (not task-status tracking), fixture guard, unit regressions, CI's explicit **3.2.4** artifact, and harness instructions. This supersedes the preceding strict-3.2.5 blocker, without rewriting the historical review/probe results or logging progress. Other minors and prereleases still fail closed; no auto-fallback or configured target/storage option was added.
- Real fixture: official Windows binary **3.2.4+20260803.93ab219**, observed SHA-256 `ad200ea01c3cb99f84617c60d61caf40c2e13d72cc4ed08378387d2d74f8fbf4`; Node **22.22.0**, SDK **2.0.3**, Nuxt **4.4.8**, Sharp **0.34.5**. Same unconstrained Windows/16-logical-CPU/34,048,368,640-byte host as above. Generated credentials, loopback ports, namespaces/databases and receipt-owned temp directories only; memory-only owned DB children, no application startup/data access.
- Real tests first exposed fixture assumptions: SDK cancellation throws `QueryError`; 3.2.4 `/import` requires **`OPTION IMPORT;`** as the first statement; import mode returns **`[]`** because it suppresses statement output. Fixed the fixture generator's bounded prologue, asserted the known cancellation error plus rollback, used an explicit count alias rather than assuming `SELECT VALUE count()` shape, and retained strict JSON/status/byte validation. Empty acknowledgement is **not** a row count: the smoke independently verifies exact count, every ordinal and every payload via the installed SDK. Added parser tests for empty/OK/ERR/malformed/oversized responses and a zero-row one-byte-chunk generator case. Initial cancellation/HTTP 400/empty-result/count-shape failures are fixture-contract corrections, not application defects or retention benchmarks.
- Local real integration command: `npm run test:backend:integration -- --fixture --surreal-bin=<absolute official 3.2.4 binary>` passes **7 tests / 2 files**, repeatedly. The smoke starts and stops two fresh DB processes, commits one transaction, proves cancellation leaves no row, streams **25 rows / 4,745 encoded bytes / 1,024-byte maximum chunks**, verifies import contents, and checks owned temp removal/idempotent stop. The existing six grouped-error tests now also pass on their own fresh owned fixture; the final 1K-group backend query is **5.3 ms locally**, not a production/browser latency result.
- Observed memory snapshots from the final real run (all bytes; **test driver, not Nitro app; samples, not peak RSS**):

  | Cycle | Driver RSS before → after | Driver heapUsed before → after | Driver external before → after | Driver arrayBuffers before → after | DB RSS before → after | Seed/import/verification elapsed |
  |---|---|---|---|---|---|---|
  | 1 | 96,251,904 → 84,090,880 | 15,481,464 → 16,507,200 | 3,976,691 → 4,140,161 | 96,703 → 260,133 | 108,290,048 → 111,091,712 | 32.548 ms |
  | 2 | 85,065,728 → 85,696,512 | 15,944,864 → 16,644,112 | 3,992,109 → 4,155,555 | 104,290 → 267,736 | 108,101,632 → 108,752,896 | 35.613 ms |

- Node 22 checks: `npm run lint`, `npm run typecheck`, `git diff --check` pass; `npm run test:unit -- --maxWorkers=4` passes **904 / 6 expected fail / 16 skipped (926 total), 66 files passed / 1 skipped**. Default-parallel `npm run test:unit` still hits the previously documented unrelated Japanese dictionary timeout: **903 passed / 6 expected fail / 16 skipped / 1 failed**. No dictionary code, timeout or default worker configuration changed. Six expected failures remain open finding reproductions, not fixes. Final focused run: **13 passed / 6 expected fail, 3 files**. Documentation/fixture validator passes **27 files** for whitespace, **42 relative links**, all **25 task entries**, and CI YAML/pin/opt-in checks.
- Phase 0 is complete **locally**; all F-01–F-27 remain open. Production build/Nitro/browser/proxy/optional-module matrix, scoped identities, Linux filesystem/crash/scale/CPU measurements, deployment-version reruns and approved-copy/operator/overnight release gates remain pending. No production approval is granted by the target amendment or the fixture pass. Next eligible Phase 1 task: **REV-1.1** (parallel security lanes REV-1.3/1.4/1.6 also eligible); application work is outside this Phase 0 change.