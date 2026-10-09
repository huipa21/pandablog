# Full-only backups: implementation plan

**Status: proposed; documentation only, no runtime changes.** The user requests full backups only, removal of partial/incremental complexity, and one compressed download containing DB and media. Read [progress.md](./progress.md) first; record implementation and verification there, not by rewriting task definitions here.

## 1. Target experience and scope

1. **Create backup** always captures a fresh full database export and all current media originals. Optional note; no type, parent, base or table selector.
2. **Download backup** downloads one portable `pandablog-<id>.tar.gz` containing the DB dump, media archive and integrity manifest.
3. **Import backup** accepts that same single file and registers a validated full snapshot. Import does not automatically restore it.
4. **Restore** remains explicit, replace-only and confirmed. Full-only does not mean removing validation, exclusive restore admission, paired safety/rollback or crash recovery.
5. New snapshots have no ancestry. Remove chain traversal, incremental hash differences, partial-table consolidation and dependent-backup UI from normal operation.
6. Existing full snapshots remain usable. Existing non-full/unknown snapshots must not be deleted, relabeled as full or silently restored with missing data.

Interpretation: remove **both** incremental-media and partial-table backup modes. Removing only the partial radio button would leave most of the complexity the user wants removed.

### Recommended decisions requiring confirmation before implementation

| Decision | Recommendation | Trade-off |
|---|---|---|
| Portable format | Versioned `.tar.gz` containing the existing `db.surql.gz`, `media.tar.gz`, and `manifest.json` | Reuses current codecs and hardened media importer. Inner files are already compressed; use low-level outer gzip, not expensive recompression. |
| Storage | Keep existing internal DB/media/manifest files; publish one completed bundle alongside them | Least invasive restore change; approximately doubles compressed snapshot disk usage. Measure actual overhead and document it. No new cache/expiry service. |
| Old non-full snapshots | Preserve and label unsupported for automatic restore/download; migrate on an approved isolated copy with a compatible old release if needed | Actually removes runtime chain/consolidation code. This deliberately changes old non-full compatibility; confirm before coding. |
| Retention with old non-full/unknown records | Suspend automatic pruning while any such record exists; report why | Avoids deleting full bases needed by preserved legacy backups without keeping a chain engine. Offline retirement is operator-authorized, not automatic. |
| Existing full-only clients | Retain thin raw DB/media GETs and legacy full multipart import, without consolidation | Keeps existing full-backup workflows compatible; UI uses only the new single-file flow. No legacy non-full executor. |
| Restore settings | Show validation and safety as mandatory protections, retain their current runtime semantics | Do not silently turn a saved `auto_safety_snapshot=false` into permission to restore. Remove only partial-specific settings in this task. |

Bundle storage and the legacy non-full policy are proposals, not already approved compatibility or deletion changes. If the user requires old non-full restores in the new app, revise scope explicitly: that needs a compatibility subsystem and prevents complete removal of chain logic. An offline converter is **not** included by default.

### Out of scope

Scheduling, cloud backup, encryption/key management, selectable table exclusions, new retention durations/defaults, distributed locking, generic recovery endpoints, ROOT-free maintenance, changing setup/access-log/media receipts, deployment or live restore. Do not add ZIP as a second new format, a bundle cache framework, or a parallel restore engine.

## 2. Documentation precedence and execution practice

Follow the existing project document split: stable plan/specs, mutable progress/evidence, acceptance matrix and draft operator runbook.

- [Maintenance jobs/restore contract](../maintenance-simplification/specs/02-jobs-and-restore.md) controls job ownership, drain, uncertainty holds, destructive intent and restart behavior.
- [Backend backup spec](../backend-hardening/specs/05-backups-and-maintenance.md) controls bounded streams, trust, integrity, paired rollback and archive safety. This proposal replaces only its active multi-mode/chain requirements **after approval and implementation**.
- [Runtime environment/identities](../runtime-startup-config/operations.md) controls current scoped runtime identity, explicit privileged maintenance credentials, session/MFA keys and configuration. No ordinary ROOT fallback.
- [Logging operations](../logging/operations.md) is the current access-log contract. The older [logging backup spec](../logging/specs/04-backups.md) is historical/interim; do not resurrect `include_access_logs` or a selectable access-table export.
- [Backend harness](../backend-hardening/harness.md) and [verification spec](../backend-hardening/specs/09-verification.md) control isolated tests, Node 22, stable SurrealDB 3.2.x and evidence tiers.

Before each task: read progress, dependencies, applicable specs and current code; add a small failing regression; implement within scope; run relevant checks; update progress with exact versions/results and next action. Source findings and historical tests are not new execution evidence. Use one integrating owner for shared backup, settings, maintenance and UI files.

**Safety:** never use the user's `.env`, configured DB, `storage/`, backup artifacts or deployment as test fixtures. No receipt cleanup, credential changes, data deletion, commit/push or rollout is authorized by this planning request.

## 3. Source-confirmed baseline

Assessment revision: `ff4a890` (recheck before implementation).

| Area | Current implementation | Intended disposition |
|---|---|---|
| Creation | `server/utils/backups/create.ts`: three modes; DB is full for incremental, selected tables for partial; incremental media hash difference | One full worker; all originals; retain publication lease and job ownership |
| Records/history | `config.ts`, `registry.ts`: type, parent, chain root, hash union, descendants, ancestor-aware pruning | New active full record plus conservative legacy classification; no automatic rewrite of old rows |
| Restore | `restore.ts`, `chain.ts`, `validate.ts`: chain extraction and partial consolidation | Stage exactly one full snapshot; preserve shared staging/verification and complete cutover/rollback sequence |
| Download | Split `download/db.get.ts` and `download/media.get.ts`; DB partial consolidation exists | New bundle GET; thin full-only compatibility GETs; delete consolidation execution |
| UI mismatch | Backups page offers incremental media `?consolidate=1`, but media GET currently sends only its own archive | Remove the unsupported chain action; never present a delta archive as a standalone backup |
| Import | `import.post.ts`, `upload.ts`, `importExternal.ts`: separate DB/media plus optional manifest, streamed and validated | One-file bundle frontend; bounded outer unpacking feeds the existing full validator |
| Settings | `settings.ts`, settings PUT/dialog: retention, validation, safety, unused partial defaults | Remove `default_excluded_tables`; mandatory protection text; preserve stored safety=false refusal |
| Schema | `server/utils/schema.surql`: schemaless backups table, created-time and parent indexes | Add bundle metadata without destructive migration; optional parent-index retirement only if independently justified |
| UI | `pages/admin/backups/index.vue`, five backup dialogs, en/zh-CN locales | One create, one download, one import; no ancestry/table/type controls for active full snapshots |
| Tests | Existing create/settings/status/ownership/schema/stream/archive units and guarded real restore integration | Replace obsolete mode successes with explicit rejection/preservation; retain independent safety coverage |
| Docs | `Readme.md` says no automatic retention and describes background variants | Reconcile with `max_backups` pruning and restore-owned variant rebuilding; preserve historical ledgers |

## 4. Specs and acceptance

| Document | Purpose |
|---|---|
| [00-architecture](./specs/00-architecture.md) | Scope, invariants, paths, data model, compatibility and resource policy |
| [01-bundle-and-api](./specs/01-bundle-and-api.md) | Portable format, publication, download/import/API contracts |
| [02-ui-and-restore](./specs/02-ui-and-restore.md) | Simplified UI/settings, full-only restore, retention and migration |
| [acceptance-test.md](./acceptance-test.md) | Task-to-test matrix and release boundary |
| [operations.md](./operations.md) | Draft target workflow, upgrade/legacy/recovery guidance |

## 5. Tasks and dependency order

### BK-00 — Documentation and approval checkpoint

- **Depends on:** none. **Size:** S. **State:** docs drafted; decisions pending.
- Confirm the decisions in section 1, especially preserved-but-unsupported non-full snapshots and added bundle disk cost.
- Validate links, task references and whitespace. Record approval separately in progress.
- **Done when:** the target is approved and documentation checks pass. Drafting this plan alone does not complete approval.

### BK-01 — Contract inventory and regression foundation

- **Depends on:** BK-00. **Size:** S. **Specs:** 00, 01, 02.
- Recheck all type/parent/table/chain/consolidation consumers, auth/CSRF/module routes, retention and recovery artifact users. Keep shared schema/runtime consumers distinct from backup-only helpers.
- Add failing regressions for rejecting incremental/partial creation, unknown type normalization, standalone full restoration, exact bundle layout, old non-full refusal and preservation.
- Establish owned bundle/upload/download fixtures with injectable limits/faults and a current supported Node/DB baseline.
- **Done when:** inventory and tests are durable/unignored, failures map to missing feature contracts rather than broken fixture setup, and current safety regressions remain passing.

### BK-02 — Bounded portable bundle codec

- **Depends on:** BK-01. **Size:** M. **Specs:** 00, 01.
- Add focused bundle/manifest helpers (suggested `server/utils/backups/bundle.ts`), using existing `tar`/Node streams, not whole-archive buffers or shell commands.
- Implement exact three-member packing, strict versioned parsing, hashing, size/disk/entry/deadline caps, fresh owned stages and exclusive durable `.part` publication.
- Add strict legacy-full metadata adaptation; do not infer an unknown/non-full record to be full.
- **Done when:** acceptance A1–A7 passes, including empty-media and hostile outer structure, abort/disk failures and cleanup settlement. Limits and error categories are recorded.

### BK-03 — Full-only creation, records and pruning

- **Depends on:** BK-02. **Size:** M. **Specs:** 00, 01, 02.
- Change create options/API to note plus optional literal `type: 'full'` for old full clients. Reject parent/table/non-full input before admission or persistent side effects.
- Simplify worker to full export + all originals. Preserve media publication/deletion exclusion, immutable source checks, streamed file sync and integrity metadata.
- Build bundle before ready publication; add additive bundle filename/version/bytes/SHA-256 metadata and reconciliation for incomplete publication.
- Remove incremental creation/hash union and partial selection. Keep bounded old metadata for display/history and fail-closed classification.
- Apply existing count-based retention only to eligible full records; suspend automatic pruning if legacy non-full/unknown evidence exists. Keep default/max semantics unchanged.
- **Done when:** B1–B6 passes, only completed inner artifacts plus bundle become ready, no failed worker removes an ambiguous published snapshot, legacy bytes/rows are unchanged, and any changed SQL is exercised on the isolated real DB.

### BK-04 — Unified download and single-file import

- **Depends on:** BK-03. **Size:** M. **Specs:** 00, 01.
- Add `server/api/admin/backups/[id]/download.get.ts`; stream prebuilt bundles under existing reader admission, current superadmin checks and no-store headers.
- Package legacy full snapshots once under serialized `package` ownership; no SQL consolidation, no live DB export, no modifying their inner artifacts. Downloads of new bundles are not heavy jobs.
- Extend bounded multipart ingestion with exclusive bundle mode; feed validated outer members into the existing full import pipeline; new import registration always publishes a bundle too.
- Keep full-only legacy split endpoints/import as small compatibility adapters; explicitly reject consolidation parameters and non-full records.
- Resolve open-stream versus delete/prune races on Windows and Linux with narrowly scoped snapshot read leases (not app ownership); preserve budgets and settle before cleanup.
- **Done when:** C1–C8 passes through real H3/Nitro and filesystem streams, including current authorization, CSRF, disconnects, mutually exclusive multipart modes and deletion races.

### BK-05 — Full-only restore and legacy compatibility boundary

- **Depends on:** BK-04. **Size:** M. **Specs:** 00, 02.
- Refuse old non-full/unknown records before beginning restore/fencing. Adapt legacy full inner files; validate one full snapshot rather than resolve a chain.
- Remove `chain.ts` and `consolidateDumps` when confirmed unused; retain `validateDumpByStaging`, `verifySnapshot`, media catalog validation and runtime/schema/session/cache repair.
- Preserve journals/status capabilities/uncertainty holds and interrupted-restore classification, including old journals naming retired phases. Retiring the producer does not erase recovery evidence.
- Replace multi-mode real-DB acceptance with full/empty/imported/legacy-full round trips and full-source paired rollback. Keep historical selected-row tests only if they validate another still-supported subsystem.
- **Done when:** D1–D8 passes; full restore and forced paired rollback work on actual isolated DB/media, destructive interruptions remain fenced, and no chain executor survives in the active backup flow.

### BK-06 — UI, settings, locales and active docs

- **Depends on:** BK-05. **Size:** S–M. **Specs:** 02.
- Simplify create dialog/page, one download action, one import input, combined artifact size, progress packaging, legacy warning, retention hold and error messages. Keep polling client-only and verify SSR list loading with request-auth forwarding.
- Remove backup table-list route if no other consumer, parent/base/table/type UI and obsolete locale keys in both languages. Do not remove unrelated analytics `partial` labels.
- Remove partial default settings from live API/UI; ignore persisted legacy keys without broad DB cleanup. Explain current mandatory restore protections without allowing unsafe skip behavior.
- Update README, logging/backend/runtime active runbook sections, route matrix/module tests and release requirements. Add narrow cross-links in predecessor specs; do not rewrite historic test outcomes.
- **Done when:** E1–E6 passes, docs/API/UI agree, en/zh-CN are complete, style tokens/accessibility are preserved, and old full clients behave as documented.

### BK-07 — Combined verification and operational handoff

- **Depends on:** BK-06. **Size:** M. **Specs:** all.
- Execute full local quality, guarded real DB, production-build/browser/module and owned Linux fault matrix. Measure bundle disk/CPU/time and separate application/DB memory with finite representative inputs.
- Finalize operations, exact API/format/compatibility release notes, failure recovery and downgrade limitations. Record mandatory local gaps as blocked; operator gates remain pending outside code completion.
- **Done when:** F1–F6 local gates pass with reproducible evidence, obsolete multi-mode runtime code is absent, and progress gives a truthful handoff. Do not fabricate release-evidence entries or declare deployment approved.

## 6. Definition of done and commands

Each code task: targeted regressions, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `git diff --check`; exact results/versions in progress. New tests must not be ignored. Changed SurrealQL and import/export semantics require isolated stable 3.2.x using the approved fixture (default pin 3.2.4), not mocks alone.

```sh
# Run with supported Node 22 (current repository pin: 22.22.0).
npm run lint
npm run typecheck
npm run test:unit
npm run test:backend:integration -- --fixture --surreal-bin=/absolute/path/to/surreal
# Production/module/browser commands must use the owned app harness,
# sanitized fixture environment and temporary module profiles; not the user's .env.
git diff --check
```

Docs-only work requires local-link/task/dependency checks and whitespace checks, not application startup or DB tests. Read [acceptance-test.md](./acceptance-test.md) before claiming local completion.

## 7. Risks and delivery boundary

- Legacy non-full compatibility is the main product decision; do not hide it behind automatic conversion or silent data loss.
- Prebuilt bundles increase disk usage and backup completion time. Abort safely on insufficient headroom; do not raise limits or change retention to compensate without approval.
- A completed outer tar/gzip is not proof of valid SQL/media, and trusted SQL staging is not a hostile-input sandbox.
- Existing full snapshots may lack a bundle; package them without re-exporting the live database or changing snapshot identity.
- Ready publication, streamed download and deletion must not race; terminal restore evidence must not be “cleaned up” because chain code disappeared.
- This is one coordinated release: creation, format, import/download, restore/UI and compatibility policy together. Intermediate task branches are not deployment-ready.

Planning estimate: roughly **4–7 engineering days** including isolated verification, dependent on fixture/runtime availability and legacy decisions; not a delivery guarantee. No production operation is part of that estimate.
