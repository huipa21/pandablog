# Backend hardening: operations and release runbook

**DRAFT — planned behavior, not instructions claiming the current application is fixed.** Finalize in REV-5.2 after implementation and local verification. Task/evidence status is in [progress.md](./progress.md); existing deployed logging behavior remains documented in [logging operations](../logging/operations.md).

## 1. Current operator cautions

Until the relevant tasks are complete:

- Do not assume password reset, account disablement or role demotion revokes existing session cookies.
- Do not place private media behind a public cache assuming the current application headers are safe; already cached public responses need explicit proxy/CDN invalidation.
- Do not assume the IPv6 SSRF guard protects all local/metadata destinations; restrict outbound connectivity independently where possible.
- Avoid concurrent large media jobs and large restores on constrained memory; streamed backup creation does not imply streamed restore.
- Do not remove migration markers or receipts to bypass a failing startup. A missing media-version marker currently invokes a destructive catalog reset.
- Treat SQL backup artifacts as executable administrator-controlled input and protect them as secrets. Do not validate untrusted imports against a production DB process.
- No review/handoff activity authorized a production migration, purge, image change or restore.

These are containment cautions, not a complete operational mitigation plan. Use the owner/operator's approved change process.

## 2. Intended deployment model

The initial hardening target is one Nitro process/app writer with a persistent storage mount and a separately managed SurrealDB 3.2.5 service. The Nginx example overwrites inbound X-Forwarded-For with its socket client IP; retain that behavior and prevent direct public access to the app port.

Before release record:

| Item | Value to fill after implementation/rehearsal |
|---|---|
| Application image/revision | pending |
| Supported Node 22 minor / installed Nuxt/SDK/Sharp | pending |
| SurrealDB image/version | 3.2.5 target; actual pending |
| App CPU/memory / DB CPU/memory | pending measured profile |
| Persistent media/log/backup/journal/temp paths | pending actual mounts |
| UID/GID, free-disk reserve and temp quota | pending |
| Image/KDF/query/log/cache budgets | spec 00 proposes targets; final actual values pending |
| Backup expanded-byte/import size limits | pending DB-side measurements |
| Runtime scoped user / privileged maintenance identity | pending verified permissions |
| Restart/migration/session invalidation effects | pending exact release behavior |

Do not copy proposed spec budgets into production without validating the supported hardware/workload envelope.

## 3. Pre-release checklist

1. Read the current progress release-gate table. Require REV-5.1 evidence on Node 22 and isolated 3.2.5, not only Node 24 unit tests.
2. Obtain an explicitly approved production-data copy with **separate** DB/media/access-log directories. Rehearse on that copy first.
3. Take independently verified DB, originals, access logs/receipts and configuration backups. Confirm free space for SQL staging + safety snapshot + old/new media + compression artifacts. Never assume app DB/media backups contain access files.
4. Identify all automatic writers, schema/backfill work and scheduled retention. Stop old writers before an incompatible schema cutover; no overlapping rolling old/new deployment.
5. Confirm owner account recovery and expected cookie invalidation. Preserve secrets; do not overwrite `.env` from examples or print credentials into logs.
6. Confirm scoped runtime credentials and separate privileged restore/provisioning access. Verify rollback image/schema compatibility, not just a saved image tag.
7. Configure application and proxy upload/deadline limits consistently. Current generic Nginx 100 MiB limit will reject a larger backup import even when the app allows it; any exception must be restricted and bounded.
8. Purge old public-media proxy/CDN entries as needed. Cache header changes cannot retract bytes already distributed.
9. Operator explicitly approves deployment only after the rehearsal gates pass.

## 4. First startup and smoke checks

Fill exact commands from the implemented interfaces in REV-5.2; do not invent a recovery CLI before it exists.

- Confirm version/image, mounts, owner/permissions, single-writer ownership and current journal state.
- Distinguish process health from readiness. A live process in `recovery-required` must not accept ordinary writes.
- Verify migrations preserve catalog/settings and mark completion only after successful conversion. Missing/corrupt marker must refuse or migrate, never silently delete media.
- Old cookies should fail according to the release's epoch migration; new owner login and MFA must work through the actual HTTPS proxy.
- Try anonymous versus owner reads of a private post, original, thumbnail and known ZIP URL through the real cache/proxy.
- Check one ordinary image/doc upload, two-file ZIP, media search page, small graph/search request and analytics event.
- Check queue/drop/connection/journal warnings and schema/credential errors without logging secrets.

## 5. Restore/recovery procedure (target)

Only use this once REV-2.* is implemented and its exact controls are documented:

1. Verify artifact provenance, checksums, compatibility, expanded-size limits and disk reservation.
2. Start one owner-authorized job and confirm a durable journal plus closed mutation admission.
3. Require successful drain and staged validation before wipe. A failed drain/validation aborts without changing live data.
4. Follow journal state through safety snapshot, destructive cutover, schema/credential repair, media publication and verification. Status must remain available through the approved owner-scoped mechanism without reopening general auth/setup.
5. On error, leave consistency decisions to the journaled recovery procedure. Do not delete `.job.lock`, phase files or safety snapshots to make the UI usable.
6. If rollback fails, keep service fenced; preserve DB/media safety artifacts and error evidence for reviewed recovery.
7. Reopen only after DB/media/auth/cache verification. Release stale rebuild workers only under the committed generation/admission policy.
8. Retain or remove safety artifacts according to the verified commit/recovery policy, never because a request timed out.

Rollback of a release is not necessarily an image-only operation. Schema states, auth epochs, media publication claims and journal format may require restoring the consistent pre-cutover snapshot or a supported downgrade path. Document the exact supported path before production.

## 6. Resource/maintenance observations

Record measured app RSS/native memory, DB RSS, request latency, queue high-water/drop counts, temp bytes, source/output sizes and operation duration. Separate cache freshness from actual eviction and separate database logical deletion from physical disk compaction.

Operational signals to document once implemented:

| Signal | Required interpretation |
|---|---|
| Rate/KDF/media admission rejected | Capacity or abuse limit reached; not a reason to remove the bound without measurement |
| Access scan truncated/unavailable | Lower bound/incomplete search, not exact zero or definitive missing detail |
| Deletion completed=false | More eligible work remains; retry/resume according to checkpoint |
| DB deadline / ambiguous write | Caller timeout is not proof the write did not commit; do not blindly repeat |
| Log queue drops/coalescing | Best-effort diagnostic/audit loss explicitly counted; inspect DB/disk pressure |
| Restore recovery-required | Ordinary service stays closed; preserve safety artifacts and follow recovery |
| Analytics day unpublished | Raw data must remain retained; investigate failed job before purging |

After deployment observe at least one overnight schedule/24-hour window, including UTC rollover, cleanup/checkpoint continuation and graceful restart. Transcribe actual numbers into progress, not inferred savings.

## 7. Final release sign-off

- [ ] Exact commands, runtime/env defaults and response/report changes replace draft placeholders.
- [ ] Owner recovery, stale-session rejection, privacy/cache and SSRF regressions pass through deployed boundaries.
- [ ] Approved-copy migration/restore/fault/scale rehearsal recorded.
- [ ] Resource budgets and alert/drop behavior accepted by operator.
- [ ] Rollback and recovery artifacts/procedures verified.
- [ ] Production authorization and post-deployment observations recorded in progress.
