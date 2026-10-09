# Phase 5: integration evidence and release handoff

> **Approved lifecycle refactor:** [maintenance simplification](../maintenance-simplification/plan.md) makes single-instance exclusion a deployment guarantee and distinguishes ordinary automatic crash restart from destructive-restore recovery. Its MS-05/06 tasks reconcile affected checker/handoff wording without waiving unrelated release prerequisites or fabricating evidence. The working tree implements the lifecycle; checker requirement wording is reconciled, but no evidence manifest/gate is fabricated or waived. See maintenance progress for exact local results and remaining blockers.

**Status: preparatory tooling only; REV-5.1/5.2 are blocked by Phase 4. No release approval.**
Read [progress](./progress.md), [plan](./plan.md#phase-5-integration-and-release-handoff),
[spec 09](./specs/09-verification.md) and the [draft operations runbook](./operations.md).
The checker does not implement the unfinished lanes or run a test, app, import, purge or deployment.

## 1. Prerequisites and decisions

REV-4.2 needs explicit approval of a summary-history retention duration and legacy-history
policy, or an approved amendment preserving indefinite history. Existing aggregates may be
the only remaining history after raw pruning. The candidate 3,650-day duration is **not** an
implemented default or permission to delete history.

Finish REV-4.3's unknown-count purge/API/audit/UI contract and deep-page ceiling, then
REV-4.4–4.7's global logging/report, graph, FTS/backfill and public-cache/runtime work.
These remain separate implementation tasks. No local evidence or operator risk waiver can
substitute for unfinished mandatory local tasks. Preserve legacy media deletion holds,
setup/maintenance authority and access migration receipts.

## 2. Read-only commands

From the repository root, with dependencies installed:

```sh
npm run release:report           # All stages; valid pending reports exit 0
npm run release:check:local      # Prerequisites + all mandatory local evidence
npm run release:check            # Local + REV-5.1/5.2 + pre-deploy operator evidence
npm run release:check:postdeploy # Above + deployed and overnight evidence
```

Checks exit **1** on blocked/incomplete evidence; malformed input/Git/artifacts also exit 1.
Report mode is inspection, **not** a CI release pass. Output is JSON, with the candidate
Git HEAD, gate requirements/status/reasons and blockers. `productionApproval` is always
false: even `ready: true` means only that recorded requirements are satisfied, not that
the checker grants authority. A named operator must review the artifacts and approve cutover.

The only CLI inputs are report/check and stage. No endpoint, credentials, storage directory,
external URL, shell command, dotenv or recovery options exist. Recorded `command` strings
are provenance, **never executed**. Git commands run with a sanitized environment.
The tool reads the fixed progress/manifest files and bounded regular evidence files only;
it never connects to DBs or modifies application storage, files, task status or the manifest.

## 3. Evidence matrix

The IDs below are enforced by `scripts/backend-hardening/release-readiness.ts`.
All are **pending for combined Phase 5 acceptance**. Earlier task results in progress are
useful component evidence, not fresh combined/candidate acceptance.

| Gate ID | Tier / owner | Required coverage / existing starting points |
|---|---|---|
| `node22-checks` | Local real integration / implementer | Node 22.22.0: full lint, typecheck, default units, diff check; explicitly record skips/flakes |
| `db-security-faults` | Local real integration / implementer | Guarded stable 3.2.x SQL/identity/MFA/privacy/lifecycle/restore/media/analytics/group tests; DATABASE EDITOR runtime and separate ROOT; rerun new Phase 4 regressions when implemented |
| `module-builds` | Local real integration / implementer | Full-feature, minimal single-author, touched-module-disabled builds and production Nitro smoke; analytics/logs/backups/MFA/multi-user/graph combinations |
| `linux-filesystem` | Isolated rehearsal / implementer | Linux symlink/hard-link/inode/fsync/rename/permissions/disk-full/mount cases; Windows skips do not pass |
| `browser-proxy` | Local real integration / implementer | Guarded real Nitro, actual proxy/shared-cache, browser en/zh-CN, current/stale cookies, CSRF, originals/variants/ZIP, absence of legacy IPX transforms, visibility transitions, personalized SSR and query duplication |
| `crash-recovery` | Isolated rehearsal / implementer | Ordinary forced replacement restarts without app receipts; destructive restore DB/journal/fsync/rename/publication/checkpoint death preserves paired evidence and fences. Domain generations, client policy, verified rollback, stale-worker safety and cleanup remain required |
| `mixed-load` | Isolated rehearsal / implementer | Explicit CPU/app/DB/disk limits, predeclared distributions and latency targets, repeated increasing cardinality, health/status latency, RSS/native/DB/disk/queues/sockets and HTTP p50/p95/p99 |
| `operations-handoff` | Operator review | Final exact env/defaults, compatibility limits, migration/session invalidation/recovery/rollback, finding dispositions and all applicable logging gates |
| `copy-rehearsal` | Operator | Explicitly approved isolated production copy, separate DB/media/log mounts, blocked live-source writes and approved retention effects |
| `backup-rollback` | Operator | Independently verified consistent DB/media/log/config backups, image/schema/credential compatibility, owner/MFA recovery and rollback rehearsal |
| `mounts-budgets` | Operator | Actual persistent paths, UID/GID, restore journal/job/setup/access/media receipts, hard links/rename, disk headroom and measured resource envelope (no application-owner receipt) |
| `proxy-cache-purge` | Operator | Purge existing public-media CDN/proxy/IPX entries and test actual deployed boundaries, or explicit time-limited risk acceptance |
| `single-writer` | Operator | Deployment guarantees one app instance; stop/remove-before-create replacement, no rolling overlap or uncoordinated external writers; reset CLI participates in job serialization |
| `cutover-authorization` | Operator | Named, timestamped explicit authorization for candidate/image/config/deployment; cannot be risk-waived |
| `deployed-security` | Operator | Owner login, old-session rejection, roles/privacy/CSRF/proxy, health versus readiness, sample upload/ZIP/jobs/status and approved staging restore |
| `overnight` | Operator | Actual 24-hour/UTC rollover/overnight schedules, checkpoints/retention/queue warnings/resource observations; rollback remains available |

### Reproducible commands available now

Use the pinned Node in `PATH`, including child processes. These are commands to run under the
existing isolated harness contract, **not commands run by the readiness checker**:

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run test:unit -- --maxWorkers=4 # supplementary, not a substitute for the default result
npm run test:unit -- tests/unit/backend-release-readiness.test.ts
git diff --check
npm run test:backend:integration -- --fixture --surreal-bin=/absolute/path/to/surreal
```

See [harness](./harness.md) for the owned loopback memory DB/environment/cleanup guards.
Exact Node/SDK/DB build/Nuxt/Sharp/OS and actual commands must accompany results.
No changed SurrealQL is introduced by this handoff tooling.

**Not yet supplied:** a guarded combined Nitro/browser/proxy/module runner, Linux full fault
rehearsal and constrained mixed-load runner. Do not use the legacy `test:e2e` configuration:
it loads `.env` and can reuse an existing app server. Do not run `npm run build` in the
configured checkout as isolated evidence. Build/runtime/browser work must use an owned source
copy without `.env`, configured module credentials, application storage, generated outputs
or live targets, with generated fixture config/credentials and owned loopback services.
Missing runners/environments are blockers, not inferred passes.

### Measurement protocol

Before the final scale run declare CPU/memory/disk limits, workload distributions and
supported latency targets. Spec 09 suggests 2 vCPU / 1-GiB app / 2-GiB DB with explicit disk
quota; that is not a measured production profile. Capture before/during/after Node RSS,
heapUsed/external/arrayBuffers/event-loop delay, independent DB RSS/CPU/plans, file bytes,
queue high-water/drops, descriptors/sockets, HTTP p50/p95/p99 and health/status latency.

Run all seven spec 09 workloads, including stalled-DB distinct errors, graph/CJK rebuild,
cookie-key expiry and concurrent native image/KDF/DB/disk work. Record seed failures apart
from operation failures. SQL over the implemented 128-MiB expanded cap must refuse before
wipe; do not raise heap/import limits to manufacture a larger-than-memory pass. Measure the
supported finite import cap separately. Component/helper RSS is not constrained Nitro RSS.

## 4. Recording evidence

`release-evidence.json` starts with an empty `records` array intentionally. Missing rows are
pending. Do not auto-populate passing evidence from historical progress or this tool's tests.

Each completed record has:

- `id`: one matrix ID; `status`: `passed` or `accepted-risk` (pending/blocked/failed rows may
  instead use just `id`, `status`, `note`). No duplicate/unknown IDs.
- `revision`: full 40-hex Git commit of the tested implementation; `observedAt`: UTC ISO timestamp.
- `tier`: `source`, `unit`, `integration`, `rehearsal`, `operator`; at least the required tier.
- `command`, `summary`: sanitized exact invocation/results/scope, each at most 4,096 characters.
- `runtime`: actual `node` (v22.22.0), `surreal` (exact stable 3.2.x, including build metadata
  when present), `sdk`, `nuxt`, `sharp`, `os`; package versions cannot be ranges.
- `artifacts`: 1–8 `{path, sha256}` references. Paths are under
  `docs/backend-hardening/evidence/`, with simple alphanumeric/underscore/hyphen components
  and `.json`, `.md` or `.txt` extension. Each file is at most 512 KiB; the manifest is at
  most 64 KiB. All path components must be regular directories/files, never symlinks/junctions.
- `profile`: required for mixed-load; include actual resource/workload/latency targets.
- `operator`: required for pre/post-deploy evidence. Include actual approved environment,
  scope, image/config identity, timestamp and approver in the artifact, never secrets.
- `accepted-risk` additionally requires `operator`, `rationale`, `mitigation`, `expiresAt`.
  It is allowed only for operator-stage gates other than cutover authorization, never local
  prerequisites/evidence. An expired risk blocks acceptance; record the operator's actual
  authorization, not the implementing agent's guess.

Commit only **sanitized summaries**; never cookies, account epochs, passwords, MFA secrets,
SQL dumps, private records or real production paths/targets. Keep raw sensitive evidence in
operator-controlled storage and reference its approved identifier in the sanitized summary.
Hash the exact committed summary bytes with SHA-256; missing/changed/oversized artifacts block
checks. A digest is integrity bookkeeping, not a signature proving an experiment was run.
Human review must verify case coverage, measurements and authorization; the checker validates
structure/provenance/completeness, not truth of free-text summaries or measured envelopes.

Acceptance requires a clean Git working tree. Evidence for HEAD is compatible; ancestor
commits are compatible **only** when their diff to HEAD consists of the checker-listed handoff
reporting files (evidence/manifest/progress/findings/operations/handoff/Readme). Changes to code,
config, tests, specs or tooling invalidate reuse. This permits a later evidence-only commit
without a circular requirement to test the commit containing its own evidence. Commit the
implementation first, run acceptance on it, then commit sanitized evidence. Unknown/unrelated
commits are stale. The checker does not create commits or change task statuses.

## 5. Operator handoff order

1. Resolve/finish all Phase 4 work, rerun required tiers and reconcile open findings.
2. On the committed candidate collect all seven local gates. `release:check:local` must pass;
   then record REV-5.1 completion in progress, never infer it from component tests.
3. Finalize the [operations runbook](./operations.md), exact env/default/limit inventory,
   migration/session warning, paired recovery/downgrade and logging runbook amendments;
   record REV-5.2 only after its prerequisites and documentation review pass.
4. Operator approves and rehearses an isolated production copy, verifies backup/mount/resource/
   proxy/single-writer/rollback gates and explicitly authorizes cutover. `release:check` checks
   those records; it neither issues nor executes deployment permission.
5. Record real deployed security/readiness and 24-hour/overnight evidence. Run
   `release:check:postdeploy`; the operator may then supply REV-5.3 acceptance in progress.
   No production-copy permission or evidence has been supplied in this session.

Retain the separate [logging release gates](../logging/progress.md#pending-manual-verification),
including actual retained-day volume/DB/backup deltas, migration receipt verification,
error-backfill N, Linux/container persistence/browser/overnight observations. Historical
logging progress is not rewritten and none of those gates is silently considered passed.
