# Maintenance simplification: implementation plan

**Status: approved target, not implemented.** This session creates the documentation/handoff only. Read [progress.md](./progress.md) first. Record execution results there, not by changing this plan's task definitions.

## 1. Approved outcome

The user deploys exactly one application container: stop/remove the old container, then create its replacement. Overlapping application containers, rolling upgrades, multiple production Nitro workers and arbitrary concurrent external DB writers are unsupported. Deployment supplies single-instance exclusion; the application must not maintain a persistent application-owner receipt to enforce it.

Approved scope:

1. No persistent application writer lock.
2. No expert recovery after an ordinary crash or container replacement.
3. Lightweight initialization/readiness handling.
4. Backup-job serialization.
5. Traffic/background-work coordination during an actual restore.
6. Persistent maintenance recovery evidence only for interrupted destructive restore.
7. Retain current DB reconnect fixes, authentication protections and bounded resource handling.

This returns to the earlier **operating model**, not the earlier source files. A small in-memory admission/drain mechanism may still observe requests and DB/background work to make restore safe. It must not create permanent ordinary-startup ownership or crash-recovery requirements.

## 2. Authority and document precedence

This package supersedes conflicting application-owner, ordinary-crash and startup-only expert-archival requirements in:

- [Runtime startup plan](../runtime-startup-config/plan.md) and [startup ownership spec](../runtime-startup-config/specs/01-startup-ownership.md).
- [Backend architecture](../backend-hardening/specs/00-architecture.md), [backup/maintenance spec](../backend-hardening/specs/05-backups-and-maintenance.md) and [writer inventory](../backend-hardening/writer-inventory.md).
- Their runbooks, release-handoff wording and tests that require stale `.writer.lock` refusal.

Supersession is narrow: scoped identities, canonical environment names, non-destructive migrations, setup authority, revocable sessions, private media, streaming, bounded queues, restore consistency and logging migration contracts remain applicable. Historical results are not rewritten. Before implementation the existing executable still follows its existing behavior; these docs are not instructions to delete current recovery files.

Approval of the target is not permission to deploy, operate on configured data, reset credentials, archive user receipts or perform a live restore. The implementing LLM receives code-edit authority when the user delegates this plan; tests remain isolated.

## 3. Historical basis

| Revision | Date in repository | Source-confirmed behavior |
|---|---|---|
| `8c043bc` | 2026-09-23 | Last mainline commit before September 26. `.job.lock` only for backup/import/restore; middleware gates traffic only for an active restore; no writer receipt, global `WriteBarrier` or startup recovery coordinator. |
| `7c2fe47` | 2026-10-06 | Introduces `.writer.lock`, application-wide operation leases, owner-scoped barrier and durable recovery fencing. |
| `db37d6a` | 2026-10-08 | Adds explicit startup coordination and persistent ordinary-initialization failure handling. |
| `a3c0b07` | 2026-10-08 | DB outages retry automatically; uncertain writes become a time-bounded backup/restore restriction. |
| `4cfb27f` | 2026-10-09 | Documentation baseline. Fixes legacy media initialization fields and SSR backup polling, not writer-lock policy. |

The old app's satisfactory operation is user-reported. Source comparison confirms the architecture, not retrospective performance or complete crash safety. Do not use `git revert`/historical file restoration as the implementation strategy: the old media-layout path deleted `files` on a missing/different version, and restore did not drain active/background writers and could release after rollback failure.

## 4. Specs and execution documents

| Document | Purpose |
|---|---|
| [00-architecture](./specs/00-architecture.md) | Scope, lifecycle separation, retained invariants, source inventory and design limits |
| [01-startup-and-readiness](./specs/01-startup-and-readiness.md) | Lightweight startup, failure policy, shutdown, DB behavior and development reload |
| [02-jobs-and-restore](./specs/02-jobs-and-restore.md) | Job serialization, restore admission/drain, durability boundary and crash classification |
| [03-compatibility-and-cli](./specs/03-compatibility-and-cli.md) | Legacy artifacts, CLI compatibility, optional modules, deployment and rollback |
| [acceptance-test](./acceptance-test.md) | Required test/evidence matrix and quality gates |
| [operations](./operations.md) | Target operator behavior; clearly distinguished from current executable behavior |
| [handoff](./handoff.md) | Copyable full-task LLM delegation and autonomous continuation rules |
| [progress](./progress.md) | Only implementation status/evidence/decision ledger |

Read [backend harness](../backend-hardening/harness.md), [verification spec](../backend-hardening/specs/09-verification.md) and [release handoff](../backend-hardening/release-handoff.md) for fixture safety and evidence rules. Unfinished unrelated Phase 4 tasks do not block starting this refactor; they remain separately tracked release work.

## 5. Execution policy: one long delegation

Execute MS-01 through MS-06 in dependency order in one assignment. Do not stop after each task to ask whether to continue. Add regressions, integrate, verify and update progress at durable checkpoints. Resume from progress after context loss; no repeated approval is needed for already-approved scope.

- Recheck current Git/source/runtime before editing; file lists and revisions below are navigation hints.
- Preserve unrelated dirty changes. Do not reset, stash, cherry-pick/revert historical commits or commit/push unless separately requested.
- Record implementation choices within this contract; they do not require user approval. Prefer deleting ownership plumbing and reusing the smallest sound in-memory mechanisms, not inventing a new framework.
- Genuine blockers: indispensable unavailable runtime/fixture, evidence that safe restore cannot be retained under the contract, or a required change to auth, data preservation, public API, deployment topology or backup compatibility beyond this plan.
- If a verification environment is missing, continue independent work/checks, record the missing evidence and stop only when no eligible work remains. Do not label mandatory unexecuted checks passed or task completion inferred.
- Retention redesign, historical media converters, ROOT-free maintenance, unrelated FTS/build architecture and production recovery are not newly authorized work.

## 6. Tasks

### MS-00 — Approved documentation and autonomous handoff

- **Depends on:** none.
- **Deliverables:** this package, detailed specs/acceptance/runbook, initial ledger, precedence notices in older packages.
- **Acceptance:** approval/scope/history distinguished from implementation; delegation permits continuous execution but not live-data operations; local Markdown links and `git diff --check` pass.
- **Size:** S; docs only.

### MS-01 — Current inventory and failing characterization tests

- **Depends on:** MS-00.
- **Specs:** all; acceptance groups A–G.
- **Files:** current maintenance/startup/DB/backup code, tests, CLI, Docker/Compose, release-readiness tooling; see spec 00 inventory.
- **Deliverables:** current dependency/call-site map; test-to-contract disposition; small owned regressions for ordinary forced restart, legacy writer-only receipts, pre-destructive restore restart and destructive restore refusal.
- **Acceptance:** reproduce current persistent ordinary-crash failure without a DB or user storage; new expected-behavior regressions fail for the right reason; enumerate disk job users including `panda password-reset`; identify existing in-flight settlement and boot retry guarantees to retain.
- **Notes:** do not mark failing characterization tests as acceptable final tests. Existing tests asserting writer-only refusal must be replaced, not simply deleted. The repository allowlists tests/scripts in `.gitignore`; add only scoped exceptions needed for new regression/helper files so they are included in the final patch, without broadening the whole ignore policy.
- **Size:** M.

### MS-02 — Remove application ownership; simplify startup/readiness/shutdown

- **Depends on:** MS-01.
- **Specs:** 00, 01, 03 legacy-writer rules.
- **Likely files:** `server/plugins/00-maintenance.ts`, `db-init.ts`, `db-lifecycle.ts`, `server/utils/startup.ts`, `maintenance.ts`, `maintenance-handler.ts`, `db.ts`, `server/api/ready.get.ts`, startup lifecycle fixtures.
- **Deliverables:** no runtime application-owner acquisition/release; no ordinary-failure persistence callback or verified-writer cleanup protocol; simple explicit boot flight/readiness; graceful shutdown independent of receipts; no stale-writer gate in development.
- **Acceptance:** ordinary boot/crash/config-fix/outage/shutdown/development cases in groups A/B pass; startup still waits for required initialization and existing destructive-restore checks; DB reconnect/replay/disposal/bounds regressions pass.
- **Integration boundary:** until MS-03/04 finish, retain existing conservative restore-journal checks. Do not deploy an intermediate partially migrated state or stub `startWriter()` to `true` and lose restore/uncertainty loading.
- **Size:** M–L.

### MS-03 — Restore-scoped coordination and job crash behavior

- **Depends on:** MS-02.
- **Specs:** 00, 02.
- **Likely files:** backup `jobMutex.ts`, `restore.ts`, `create.ts`, middleware/status APIs, request/query/background admission, schedulers/logging/setup, job and restore tests.
- **Deliverables:** backup-family serialization with token-safe release; cross-process CLI participation; no ordinary-job/guard expert-startup fence; bounded restore drain and private restore owner; durable destructive boundary; automatic bounded abort of verified pre-destructive interruption; terminal journals do not fence startup.
- **Acceptance:** groups C/D/E pass; crash before destructive intent causes no expert recovery; crash after destructive intent preserves DB/media/safety/journal and blocks ordinary initialization/traffic; successful commit/rollback reopens only after verification. Nonrestore stale ownership cannot substitute for `.writer.lock` as an ordinary crash latch.
- **Notes:** use generation checks/drain where actually needed. No public bypass booleans, TTL-only live-job stealing, request-disconnect early release or ambiguous-write replay.
- **Size:** L.

### MS-04 — Legacy artifact migration and CLI compatibility

- **Depends on:** MS-03.
- **Specs:** 02, 03.
- **Likely files:** recovery scripts, password-reset script, `bin/panda.mjs`, Dockerfile, legacy fixture tests, backup status/UI types.
- **Deliverables:** deterministic legacy classification; writer-only records no longer block and remain untouched; read-only restore-oriented inspection; old startup-archival options safely retired; CLI job ownership/uncertain-reset behavior retained; no secrets/new public recovery endpoint.
- **Acceptance:** group F passes for writer/uncertainty/job/guard/journal/artifact combinations, file/directory legacy formats, wrong host/reused PID, unsafe paths and CLI usage. Exact CLI/status/exit compatibility changes documented and tested. No DB/media/setup/logging artifacts modified merely to start.
- **Size:** M.

### MS-05 — Integrate background/cache/module/deployment boundaries and docs

- **Depends on:** MS-04.
- **Specs:** all.
- **Likely files:** analytics/logging/download/deferred work, public caches, module build fixtures, production Compose, README, existing runtime/backend/CLI docs and release-readiness requirements.
- **Deliverables:** every writer waits for readiness and participates in restore admission as applicable; old-generation cache work cannot publish into restored state; full/minimal/backups-disabled/module-disabled contracts; no hostname/stop-grace explanation based on writer receipt; truthful recovery/help text and both translations for changed UI messages.
- **Acceptance:** A/C/F/G module/API cases pass; inventory is current; no orphan `.writer.lock` requirement in active instructions/tests/checker; historical evidence is marked superseded, not edited into a new pass.
- **Notes:** retain reasonable graceful shutdown time, existing image identity/env/scoped-auth contracts and unrelated release gates. Removing a file lock does not justify dropping shutdown drains or release evidence checks.
- **Size:** M.

### MS-06 — Combined verification and final implementation handoff

- **Depends on:** MS-05.
- **Specs:** all; acceptance matrix; backend verification subset applicable to changed paths.
- **Deliverables:** supported Node 22 full quality checks; guarded stable DB/real restore acceptance; actual Nitro production/dev tests; owned full-app build/smoke/module tests; Linux/container ordinary-crash and restore-fault evidence; final operations/upgrade/downgrade notes and ledger.
- **Acceptance:** mandatory local matrix rows pass with exact environment and test evidence; unavailable required local runtime/DB/Linux checks are `blocked`, not inferred passes. Operator production-copy/deployment/overnight gates remain pending outside this assignment. Record known unrelated failures independently; do not expand the task to resolve other backend plan lanes.
- **Final response:** summarize changed behavior/files, exact tests and remaining blockers; clearly state that no user storage/DB/deployment was operated on.
- **Size:** L, environment-dependent.

## 7. Definition of done

For each code task: targeted regressions and touched integration checks pass, `npm run lint`, production-mode typecheck without `.env`, unit suite and `git diff --check` pass or unrelated baseline failures are explicitly recorded. Do not weaken unrelated security/bounds assertions. At MS-06 run both default full unit execution and any supplementary bounded-worker run used to diagnose flakes; distinguish them.

Changed SQL/import/permissions/rollback need the guarded stable SurrealDB 3.2.x harness, exact build recorded; mocks alone are not acceptance. Build/run/browser tests use owned source copies without real `.env`, `storage/` or inherited secrets. Node 24-only/Windows-only evidence is supplementary where Node 22/Linux is required.

A task is `done` only when its required local deliverables/evidence are complete. Required external operator release gates may remain pending. Docs-only MS-00 needs link/scope/dependency consistency and diff checks, not a new application suite.

## 8. Complexity/effort boundary

Historical assessment: roughly **4–7 working days** for the broader simplification including tests/docs; this is an estimate, not an execution guarantee. A narrower `.writer.lock` removal was estimated at 2–4 days but is not the whole approved scope. Avoid substituting a renamed persistent app-owner marker, startup audit journal, lease database, distributed service or multi-instance framework. Use existing bounded primitives only where they serve readiness, resource limits or an actual restore.
