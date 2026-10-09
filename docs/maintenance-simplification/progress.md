| MS-06 | Combined acceptance and final handoff | blocked (partial) | See final checkpoint: mandatory local gaps listed; operator gates pending || MS-05 | Background/cache/modules/deployment/docs | done (local) | Background/cache/health/visibility/logging lanes, 4 module profiles, docs/help/Compose/checker reconciled; UI banner not browser-verified || MS-04 | Legacy records and CLI compatibility | done (local) | Read-only recover, retired flags, legacy classification, reset SQL on real DB; interactive reset in container not run || MS-03 | Restore coordination and job crash behavior | done (local) | Job serialization/holds, pre-destructive abort, destructive fence, paired rollback verified (unit + real DB 3.2.4); Linux real-DB restore **not** run || MS-02 | Lightweight startup/readiness/shutdown | done (local) | Writer/persistence/release removed; explicit boot flight retained; Nitro+dev Worker+full Nuxt evidence in final checkpoint |# Maintenance simplification: progress and execution ledger

> Read first in every implementation/resume session. Tasks are in [plan.md](./plan.md), requirements in [specs](./specs/00-architecture.md), test coverage in [acceptance-test.md](./acceptance-test.md), target operator behavior in [operations.md](./operations.md), and the full-task delegation in [handoff.md](./handoff.md).
> Update this file at each durable task checkpoint. Keep historical evidence intact; do not change the plan to imply progress.

## 1. Current state

- **Approved target:** the seven operating-model requirements in plan section 1. User confirms one app container, stop/remove-before-create replacement; no concurrent app instances.
- **Documentation only:** no application/CLI/test/config/schema changes in this session; no receipt archival/cleanup, user `.env` read, configured app/DB startup, account reset, credential rotation or deployment.
- **Implementation baseline:** `4cfb27f52c2787645430031079bbbd726f6cb50a` (`fix for writer.lock`). Recheck HEAD and dirty state when starting; this is not an immutable task prerequisite.
- **Current executable still uses `.writer.lock`:** approved docs do not remove existing startup fencing. Legacy records must not be cleared based on this documentation alone.
- **Next eligible task:** MS-01, then continue MS-02–06 without task-by-task approval under [handoff](./handoff.md).
- **No declared implementation blocker yet:** required Node 22/DB/Nitro/Linux/container/full-app capabilities must be checked by implementer. Historical build OOM/timing flakes are evidence to recheck, not assumed current blockers or passes.
- **Release status:** not approved; no production-copy/mount/downgrade/cutover/overnight acceptance supplied.

## 2. Task status

| ID | Title | Status | Evidence / remaining work |
|---|---|---|---|
| MS-00 | Approved docs and autonomous handoff | done | 9-file package; 12 predecessor notices; 138 local links / 10 anchors and 7 task definitions validated; docs-only diff/whitespace checks pass |
| MS-01 | Inventory and failing characterization | done | Current source/legacy producer inventory and ordinary-restart regressions reproduced; see implementation checkpoints |
| MS-02 | Lightweight startup/readiness/shutdown | in-progress | Remove application receipt and ordinary-failure persistence; retain explicit boot and DB fixes |
| MS-03 | Restore coordination and job crash behavior | in-progress | Cross-process jobs, bounded drain, destructive intent, pre-destructive automatic abort |
| MS-04 | Legacy records and CLI compatibility | in-progress | No ordinary writer cleanup prerequisite; accurate read-only inspector; reset job exclusion |
| MS-05 | Background/cache/modules/deployment/docs | in-progress | Runtime/module inventory, translations, active instructions/checker reconciliation |
| MS-06 | Combined acceptance and final handoff | in-progress | Supported Node/real DB/Nitro/full-app/modules/Linux checks; final evidence/remaining gates |

Statuses: `todo`, `in-progress`, `blocked`, `done`; `done` means required **local** deliverables verified, not release authorization. Independent operator gates remain pending until supplied.

## 3. Approved decisions

| ID | Contract |
|---|---|
| MS-D01 | Single app instance is guaranteed by deployment, not by a lifetime filesystem writer receipt. No OS/distributed app-instance replacement lock is required. |
| MS-D02 | Normal crash/restart/container replacement has no startup-only expert archival or DB-consistency assertion workflow. |
| MS-D03 | Keep explicit lightweight boot/readiness and bounded shutdown; errors must not be ignored or old unsafe startup races restored. |
| MS-D04 | Restore has bounded foreground/background drain, private owner context and durable destructive intent; interrupted destructive/ambiguous restore remains conservative. Verified pre-destructive/terminal state does not need expert startup recovery. |
| MS-D05 | Keep backup-family and password-reset CLI job serialization, including cross-process exclusion. Ordinary job/guard problems cannot become a new application-startup latch. |
| MS-D06 | Temporary uncertainty/quiescence may restrict destructive maintenance and expire automatically; it does not block normal service or become expert recovery. Document actual DB execution bounds. |
| MS-D07 | Keep current reconnect/no-replay/scoped identity, auth/CSRF/MFA/privacy/setup, data-preserving media/SQL migrations, streams and resource bounds. No whole historical-file rollback. |
| MS-D08 | Autonomous implementation MS-01–06 is delegated as one assignment; stop only for genuine blockers/new scope decisions. No production/user-data operations or automatic commit/push. |
| MS-D09 | This package supersedes only conflicting ordinary writer/recovery requirements. Independent domain receipts and unchanged security/data/release requirements survive. |

## 4. Assessment evidence (before implementation)

| Evidence | Result | Scope / limitations |
|---|---|---|
| Mainline history at September cutoff | `8c043bc`, 2026-09-23, is last before September 26 | Source/history only |
| Old backup mutex and middleware | `.job.lock` for create/import/restore; traffic gated only on active `kind === 'restore'` | No retrospective runtime/performance test; satisfactory operation is user-reported |
| Framework introduction | `7c2fe47` (Oct 6), startup coordinator `db37d6a` (Oct 8) | Source/history only |
| Ordinary crash reproduction in assessment | Replacement rejects with `owner-offline-review`; no restore started or DB contacted | Disposable owned temp writer child; Windows/Node v24.15.0 forced termination through Node API, not Linux SIGKILL/power-loss acceptance |
| Focused pre-refactor suite in assessment | 5 files / 63 tests passed: ownership, coordinator, crash, barrier, recovery assistant | Node v24.15.0; old contract/component evidence, not post-refactor acceptance; not rerun for docs-only work |
| Latest baseline `4cfb27f` | Additive missing-media-fields initialization and browser-only backup polling fix; no writer policy change | Source diff; retain fixes |
| Ignore policy inspection | `.gitignore` allowlists tests/scripts; a new `tests/unit/maintenance-simplification.test.ts` would be ignored by default | Future implementation must add scoped allowlist exceptions for new durable tests/helpers; no blanket ignore-policy expansion |

Commands/source artifacts were inspected without configured data access. Old source snapshots were extracted into an owned temporary directory and removed after inspection; they are not implementation files.

## 5. Acceptance tracking

Initially all new target matrix rows are **pending**. Populate this with concrete test-to-row links during MS-01–06; do not copy old suite totals as new coverage.

| Group | Status | Evidence / gaps |
|---|---|---|
| A — ordinary lifecycle | pending | No post-refactor implementation |
| B — readiness/DB | pending | No post-refactor implementation |
| C — restore lanes/drain | pending | No post-refactor implementation |
| D — jobs/CLI | pending | No post-refactor implementation |
| E — restore durability/round trips | pending | No post-refactor implementation |
| F — legacy/CLI/security preservation | pending | No post-refactor implementation |
| G1–G5 — combined local integration | pending | Node/DB/runtime/module/Linux capabilities to verify |
| G6 — operator release | pending | No operator evidence/authorization supplied |

## 6. Session log

### MS-00 — Approved documentation/handoff preparation

- Baseline revision: `4cfb27f52c2787645430031079bbbd726f6cb50a`; clean working tree before documentation.
- Read existing plan/progress/spec/runbook/acceptance/harness/release formats; followed their separation of immutable tasks, evidence ledger and draft operator instructions.
- Created the maintenance-simplification package with detailed source inventory, specs, seven tasks, legacy migration/CLI/job boundaries, acceptance matrix, target runbook and copyable full-task delegation.
- Added narrow approved-target supersession notices to conflicting runtime/backend/CLI documentation; current executable behavior and historical evidence are not rewritten as implemented.
- Current docs-check runtime: Node v24.15.0 on Windows/Git Bash. No application suite is required for this docs-only change.
- Validation: Node-based local Markdown checker over 21 files (9 new package files + 12 modified predecessors) passed **138 local links / 10 anchors**, 7 task definitions and ledger/dependency references. `git diff --check` passed; separate new-file whitespace/dependency/changed-path checks passed. Git emitted only existing LF-to-CRLF normalization warnings, not whitespace errors.
- No application tests, configured build, DB/CLI command or container run was performed for this docs-only task. Assessment suite results above remain explicitly pre-refactor evidence.
- No configured app/DB/storage, credentials, CLI mutation or deployment operated on.
- Next eligible task: MS-01; user can delegate the whole assignment using handoff.md.

### Implementation checkpoint — MS-01

- Rechecked HEAD `4cfb27f52c2787645430031079bbbd726f6cb50a`; the initial dirty paths are the approved documentation package/predecessor notices only. Preserving them. No configured `.env`/storage read.
- Read all maintenance specs/runbook/acceptance/handoff and backend harness/verification/release/backup contracts. Current inventory: `00-maintenance` owns writer acquisition/persistence/release; `db-init` owns required init/deferred backfills; DB leases/disabled reconnect and HTTP streaming remain separate. Job consumers: create/import/restore/consolidate/delete plus standalone reset. Background consumers: analytics session/rollup, logging flush/retention, download cleanup, deferred backfills; request wrapper spans whole handler, public cache uses barrier generation.
- Historical file job producer (`8c043bc`) is `{id,kind,startedAt,pid,host}`; directory job and v1 journal introduced by `7c2fe47`. The latter persists `destructive:true` before wipe; preparing/db-validate/safety-snapshot are isolated staging/export only. Existing terminal committed/rolled-back transitions follow verification. These producer contracts, not marker existence, determine classification.
- Added scoped tracked `tests/unit/maintenance-simplification.test.ts`: Node v24.15.0 Windows characterization **3 failed / 1 passed**, as intended: corrupt writer refusal, new writer publication, and pre-destructive restart refusal; destructive-before-dispatch preservation already passes. These are ordinary regressions, not expected-failure annotations.
- Located available Node **v22.22.0** executable and stable fixture SurrealDB binary in OS temp tooling; will version-check through guarded harness. Docker executable not in PATH; Linux/container capability still to assess. No old temporary data/log evidence is reused as a pass.
- Design: remove application ownership API entirely; retain in-memory boot/restore barrier and DB settlement. Atomic job-directory ownership without lifetime/shared publication guard; dead-local reclamation serialized by an exact-owner reclaim directory, never TTL stealing. Unknown/remote/corrupt job publication restricts jobs only (narrow offline job remedy), not startup or DB-consistency assertions. Retired guards/writers remain untouched. No intermediate state is deployment-ready.
- Next: MS-02/03 coherent startup and restore-state/job implementation, then replace obsolete regressions and run Node 22 checks continuously.

### Coherent code checkpoint — MS-02–05; combined checks underway

- Removed writer/startWriter/dev-writer/stopWriter APIs and startup persistence/release/prove-pre-mutation cleanup branches. Boot remains explicit single-flight, synchronously fences Nitro, retries DB connectivity with 2s–60s backoff, and closes within 10s. Ordinary data/config failures are `failed` with `fix-config-and-restart`, not expert ownership recovery.
- Job protocol no longer creates/uses `.ownership.guard`; retired writer/guard objects remain unchanged. Recognized dead local file/directory jobs reclaim with exact-generation reservation; corrupt/partial/remote/live-looking jobs restrict jobs only. Unknown children are preserved rather than recursive job-directory deletion. A crash during partial publication/reclamation may need a narrow offline job-only remedy (stop all jobs, preserve exact receipt), not DB-consistency assertions or startup recovery.
- Production process-start job hold is **10 minutes**, without a disk app receipt. An observed abandoned job/reset gets an independent exact-generation ten-minute hold before takeover, including a reset which failed to persist uncertainty while the app remains up. No live owner is stolen on expiry. Persisted ordinary uncertainty expires without unlinking a possibly newer CLI marker; expired records are informational and remain unchanged. This is an intentional safer cleanup deviation from old automatic unlink behavior; no retention policy change.
- Shared bounded restore classifier recognizes v1 pre-destructive producer phases, verified terminal phases, explicit destructive intent, token/path contradictions, file-format restore ambiguity, unmatched restore stages and legacy `.safety/pre-restore-uploads-*` live-swap evidence. SQL-only historical `.safety` is not a startup latch. Preflight records isolated preparation abort before bounded owned-stage cleanup; destructive/ambiguous evidence is untouched. Terminal retained safety cannot be orphaned by starting another restore.
- Added then reproduced a pre-destructive metadata-failure regression (**1 failed / 14 passed** before change). Preparation failure/drain/uncertainty now reopens ordinary service while actual pending execution retains leases; only destructive/ambiguous cutover fences persistently. Intent-publication failure is treated as potentially durable before dispatch. Verified paired rollback and stream/archive/security limits remain intact.
- Found a secondary ordinary-startup latch in `SetupAuthority.assertNoMaintenance`: the required boot probe refused any `.job.lock`. It now classifies actual restore separately; the independent monotonic setup receipt/reservation and CREATE-only transaction are unchanged. Added ordinary-corrupt-job boot-probe coverage; destructive restart still blocks setup.
- Dev Worker handoff uses an unreferenced process-local BroadcastChannel: live incumbents stop/drain before replacement; forced termination leaves no persistent owner. Private boot cannot publish ready after stopping. Deferred pool acquisition moved inside admission; analytics daily scheduler key includes restore generation. Public cache generations, logging/native/FS settlement and browser-only polling retained.
- Recovery inspection is read-only in dev/bundled paths. `clear` now includes retired writers, nonrestore jobs, quiescence, pre-destructive and verified terminal journals; `writer-active`/`review-required` are retired; `manual-recovery-required` means actual/ambiguous destructive restore only. Report fields retained (`canArchiveReviewedStartup` always false); plain inspection still exits 0, unsafe invocation/path exits 1. All old archival/assertion flags fail before I/O. No recovery data is archived or deleted by CLI.
- Node 22 focused startup/job/crash checks: **6 files / 49 passed**. Actual production Nitro plus installed dev Worker and read-only bundled recovery passed after correcting test contract assumptions. Full bounded unit attempt: **113 files passed / 1 failed / 1 skipped; 1264 passed / 1 failed / 17 skipped**, solely old uncertainty-message matching; corrected wording (no assertion removal). First concurrent default/full-DB attempt: **33 failures / 1236 passed / 17 skipped**: 29 new stale startup mocks, 2 CLI cold-process deadlines, 2 unrelated annotate/access-scan timing failures under concurrent load. Mocks corrected; CLI process commands now have explicit child deadlines and bounded 20s multi-launch test budgets. Will rerun default/bounded separately rather than claim passes.
- Guarded real DB command on Node **v22.22.0**, Windows **10.0.26300**, SDK **2.0.3**, SurrealDB **3.2.4+20260803.93ab219**, Nuxt **4.4.8**, Nitro **2.13.4**, H3 **1.15.11**, Sharp **0.34.5**, Vitest **4.1.6**: `npm run test:backend:integration -- --fixture --surreal-bin=C:/Users/huipa/AppData/Local/Temp/pb-hardening-surreal-3.2.4.exe`: **12 files / 20 passed**, 139.01s. Actual full/partial worker commit, incremental post-media paired rollback, restored credentials/epochs/original-month variants, streaming/import/permissions/media/setup/analytics/current-identity checks passed. Fresh owned DB has no old execution, so worker fixture injects a zero-initial-hold JobStore; production hold is separately deterministic-clock-tested, not waived. Added actual DB fixture `--query-timeout 30s --transaction-timeout 30s`; rerun required after that harness change.
- Lint found a new custom `deferred<void>` style violation (corrected to undefined); production `typecheck --dotenv=false` passed. No build/dev run in configured checkout. WSL Linux exists but initially has no Node/DB/container CLI; assessing eligible isolated runtime setup. Full-app/module/browser/build and Linux evidence remain outstanding, not inferred from mocked or component passes.
- Next: reconcile active docs/help/checker, owned full-app/module/dev/browser builds, Linux runtime checks, then combined reruns. No user `.env`, DB, storage, credentials or deployment operated on; no commit/push.

### Final checkpoint — MS-02–06 (local; no release authorization)

**Environment:** Node v22.22.0 (owned official binary, SHA-256 verified) on Windows 10.0.26300; owned WSL2 Ubuntu (kernel 6.6.87.2, ext4 temp dir) with owned Node v22.22.0 + SurrealDB **3.2.4+20260803.93ab219** (linux/windows); SDK 2.0.3, Nuxt 4.4.8, Nitro 2.13.4, H3 1.15.11, Sharp 0.34.5, Vitest 4.1.6. All fixtures used generated owned storage/loopback DBs/sanitized env/owned source copies (tracked files only; no .env/storage/accounts/containers of the user). No commit/push/deploy; no user DB/storage/deployment operated on.

**Results (fresh, after last code edit unless noted):**
- `npm run lint` clean; production-mode `nuxi typecheck --dotenv=false` clean (run before final doc/helper-only edits; helper edits were linted).
- `npm run test:unit` (default): **114 files passed / 1 skipped; 1289 passed / 18 skipped** on the final run. An earlier default run under the same code had 2 unrelated timing failures (`annotate` Kuromoji load 5s; `media-resources` stage-abort), both passing in isolation twice and on rerun; files untouched by this work. `--maxWorkers=4` supplementary: 114 passed, 1289 tests, 0 failed.
- Guarded real DB: `npm run test:backend:integration -- --fixture --surreal-bin=…`: **12 files / 21 tests passed** (full/partial restore, incremental paired DB+media rollback, credentials/epochs/variants, streaming import, setup, identity/MFA, **scoped password-reset SQL**, lifecycle, media, analytics). Fixture DB now explicitly uses 30s query/transaction timeouts. Worker fixture injects a zero-initial-hold JobStore (fresh DB has no predecessor); production 10-minute hold is deterministic-clock tested.
- Linux (owned WSL, Node 22): 13 focused startup/job/crash/recovery/health/db-lifecycle files **127 passed** including actual Nitro production + installed dev Worker lifecycle, SIGKILL job/restore matrix, bundled CLI. Actual full Nuxt **production builds** (Linux, built under 180s; the historical Windows build timeout was not reproduced there) for profiles full/minimal/no-backups/no-observers: ready, routes, setup, ordinary SIGKILL replacement, retired corrupt `.writer.lock` unchanged, and interrupted destructive restore fenced (503 `recovery-required`, setup 503) — **4/4 pass, HTTP only (--skip-browser)**.
- Windows full Nuxt **dev** (actual watcher reload) with real Chromium en/zh-CN: login, admin locale switch, localized nav, backups status incl. finite job-hold field, watcher reload, destructive fence: pass (full and minimal profiles; minimal run was before final edits and not repeated).
- Podman (owned, `--network=none`, pinned node:22.22.0-bookworm-slim digest sha256:7cc56ef2…): killed containers with different hostname restart classification — ordinary/pre-destructive → ready; db-wipe/media-restore/rollback → fenced. **Component probe of JobStore only, not Nitro/DB.**

**Key behavior/API changes:** no `.writer.lock`/`.ownership.guard` use; `JobStore.startWriter/stopWriter/startWriterAfterDevDrain` and startup persistence/release callbacks removed (coordinator resources: `validate/checkRestore/dispose`); `/api/ready` states retained (+`restore-recovery-required`, `recoveryRequired` only for destructive restore); status API adds `jobs_blocked_until` (+ en/zh-CN message); recover CLI statuses `clear|manual-recovery-required` (exit 0 inspection, 1 invalid), retired archival flags; Compose no longer fixes hostname. Shared process-realm barrier via `Symbol.for` (Nuxt SSR+Nitro bundles previously held separate barriers — found by the full-app fixture); readiness/health/visibility middleware no longer allocate DB flights while fenced (found by full-app fixture: it poisoned boot); detached logging no longer inherits private boot/restore scope; setup-authority boot probe no longer treats any `.job.lock` as restore.

**Deviations / decisions:** expired uncertainty markers are left in place (not unlinked); dev Worker handoff by process-local BroadcastChannel; jobs hold 10 min per new process/observed abandoned job; unknown/remote/partial job records need a narrow offline job-only remedy (documented). Old `it.fails`/writer-refusal assertions replaced, not deleted.

**Remaining mandatory local gaps (blocked/not run — NOT passes):**
1. Browser verification of Linux production build (Windows-browser→WSL bridge reached login but its admin-settings POST failed; cause not diagnosed) and of the backups-page job-hold banner text (page's own SSR list fetch shows "Could not load backups" in the fixture; likely pre-existing plain `$fetch` SSR, not investigated). G3 partial: Windows **dev** only.
2. Windows production Nuxt build/smoke not rerun after fixes (historical default-heap timeout not rechecked); Linux real-DB restore/crash rehearsal (E9) and Linux fsync/power-loss not run; a full Nitro+DB crash inside an actual container (A8) not run.
3. Interactive `panda password-reset` in container, DB-process kill during restore phases (E3 with real DB), mixed-load/scale, container-based module combinations beyond four profiles.
4. Not edited into new passes: backend release evidence manifest; unrelated Phase 4 tasks untouched.

**Operator gates (G6) pending:** production-copy/mount/backup/downgrade/proxy/cutover/overnight; DB timeouts must be configured below ten minutes on the real DB; old images keep writer behavior (downgrade needs isolated compatibility test).

**Acceptance status:** A1–A7,A9 local pass (unit/Nitro/dev); A8 partial; B1–B7 pass (unit+real DB; B8 deterministic-clock only); C1–C6 unit/H3/real-DB-restore pass, C7 unit+DB; D1–D5 pass (owned FS/processes); E1–E5,E7,E8 pass at stated tiers, E6 real DB (Windows), E9 not run; F1–F8 pass at stated tiers; G1 pass, G2 partial (Linux builds, HTTP-only), G3 partial, G4 pass, G5 reviewed, G6 pending.

## 7. Execution entry template

```text
### YYYY-MM-DD — MS-0x (local status; release scope)
- Current revision/dirty state; owned fixture/source-copy identity:
- Requirements/acceptance IDs; old/new behavior reproduced:
- Changed files and concrete implementation choices:
- SQL/API/CLI/legacy/module/deployment compatibility:
- Exact Node/SDK/Nuxt/Nitro/H3/DB build/OS and commands/counts/skips:
- Failures/flakes, evidence tier, measurements or explicitly not run:
- Security/data/complexity review and decisions/deviations:
- Remaining mandatory local blockers vs external operator gates:
- Next eligible work; no user-data/deployment operations:
```

## 8. Final handoff checklist

- Ordinary forced replacement works with legacy writer records unchanged; no renamed persistent owner/guard startup latch.
- Required boot/DB/security/resource behavior preserved; no blanket readiness or restore bypass.
- Pre-destructive vs destructive/ambiguous/terminal restore classification tested, including legacy producers.
- Cross-process password reset/job mutex and bundled/dev CLI behavior correct.
- Background/cache/module/actual dev/full-app/Linux acceptance and exact results recorded.
- Active docs/help/checker match new behavior; historical evidence retained; scoped new tests/helpers not ignored.
- Unrelated backend tasks/operator gates remain honestly pending; no manufactured release records.
