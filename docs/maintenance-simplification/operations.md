# Maintenance simplification: target operations and upgrade runbook

**Working-tree runbook — not deployment-authorized.** The refactor is implemented in source; required production/build/operator evidence may still be blocked (see [progress.md](./progress.md)). Old images may still require historical writer recovery. All implementation tests use owned disposable fixtures; no user receipt, DB, media, config or container was operated on.

## 1. Deployment contract

One app container/Nitro process, persistent storage root, separately managed SurrealDB. Stop/remove old app before creating replacement; no rolling overlap, cluster/scaled app workers or arbitrary concurrent external DB writers. CLI password reset is supported through the serialized job path, not as an uncoordinated database writer.

The target app has no persistent application writer lock. Hostname and PID are no longer prerequisites for ordinary restart. Reasonable stop grace and Nitro shutdown timeout remain useful to finish requests and safe restore checkpoints, but a normal forced exit does not impose expert recovery.

## 2. What the user sees

| Situation | Target behavior | User action |
|---|---|---|
| Normal deployment/start | Required initialization, then ready | Wait for `/api/ready` |
| Ordinary crash/OOM/power loss/container replacement | Replacement initializes normally; old writer receipt ignored | Let restart happen; no writer archival |
| DB unavailable | Bounded automatic reconnect/initialization retry | Wait; investigate DB/network/credentials if persistent |
| Invalid config/sign-in | Sanitized reason; never false readiness | Correct canonical config and recreate/restart normally |
| Migration/media incompatibility | Named initialization problem, data preserved, no ordinary ownership latch | Fix actual compatibility/data problem through its domain migration; restart |
| Backup job busy | Site stays available except an actual restore; incompatible jobs rejected | Wait/retry job |
| Recent ambiguous ordinary write | Temporary automatic backup/restore hold; ordinary service remains available | Wait for stated window; verify business result before repeating mutation |
| Restore before destructive intent interrupted | Bounded automatic safe abort/cleanup when evidence trustworthy | Wait; no expert startup-only flags |
| Destructive restore interrupted/ambiguous | Preserve paired safety/journal/media; ordinary boot and traffic unavailable | Use restore-specific offline recovery with administrator/DB operator |
| Restore verified committed/rolled back | Normal service; terminal journal informational | No archival required to restart |

No expert recovery after an ordinary crash does not mean every data/config error repairs itself. The difference is that restarting does not require certifying database consistency merely to clear an application-owner receipt.

## 3. Diagnostics

- `/api/health`: liveness only.
- `/api/ready`: required boot complete and no restore fence; 200 when ready, otherwise no-store sanitized 503. Do not use liveness as an upgrade acceptance signal.
- Static maintenance HTML/API responses avoid Nuxt error SSR and DB-backed recursive logging.
- Restore status remains narrowly authorized/capability-scoped and can survive unavailable live DB identity during cutover according to its existing contract.
- `panda recover`: read-only restore-oriented inspection. No `.env`/DB/SQL/Nitro startup, no default filesystem changes, no token contents. Retired `.writer.lock` alone is informational, not a recovery blocker.
- Old startup-only archival/assertion flags are rejected before I/O (exit 1). Plain inspection exits 0 and reports `clear` or `manual-recovery-required`; former `writer-active`/`review-required` ordinary-writer cases now report `clear`. `canArchiveReviewedStartup` is retained but always false. Unsafe inspection paths fail with exit 1.

Configuration changes in Compose require container recreation rather than just restart if process environment changed. Canonical `NUXT_` names, scoped credential policy, ROOT bootstrap/current backup limitations and MFA/session key preservation remain as documented in the [environment runbook](../runtime-startup-config/operations.md#3-environment-loading-and-canonical-names).

## 4. Legacy upgrade behavior

Target startup ignores retired `.writer.lock` paths without traversing/removing them. **Do not delete user receipts as part of an ordinary upgrade.** Old images retain their old behavior; the new working tree ignores these records without changing them.

After required candidate verification/release authorization, ordinary upgrade must succeed with writer-only legacy records still present, including changed hostname/reused PID, empty/corrupt/partial metadata. No expert startup-archival prerequisite. Historical startup archives remain untouched.

Job/guard records are classified separately; ordinary stale job ownership cannot block site startup. Preserve live CLI/job exclusion. Destructive/unknown restore evidence remains conservative. A terminal journal cannot be treated as unfinished just because the file exists. A valid pre-destructive journal can be aborted automatically only when actual legacy producer/phase/artifact evidence proves no live replacement occurred.

No automatic deletion of setup authority, logging migration receipts, media layout/claims, safety dumps, originals, variants or unknown records. Optional removal of obsolete writer files is not part of ordinary startup and is not required for success.

## 5. Upgrade checklist (operator-owned, future implementation)

1. Confirm the tested candidate and progress/acceptance evidence. Record missing local/operator gates explicitly.
2. Verify paired DB/media/config backups and sensitive backup storage, current image/env identity, UID/GID/mount/disk headroom and rollback compatibility.
3. Inspect outstanding restore state before replacing the old image. If destructive restore is unfinished, preserve all evidence and resolve it using the restore procedure; the upgrade is not a force-unfence mechanism.
4. Stop the old app, confirm no app/CLI job remains, and create exactly one replacement with the same storage/DB target. No hostname fix or writer receipt cleanup is required by the target.
5. Check readiness and sanitized logs, then representative login/private/public content/media/upload/backup status; verify ordinary background schedules resume.
6. On approved staging, exercise normal forced restart and backup/restore round trip. No destructive rehearsal against live data merely to complete the checklist.
7. Retain observations and monitor overnight schedules/reconnect/resource warnings according to existing release gates.

These are future operator actions, not commands the implementation LLM should execute against the user's deployment. Use generated owned fixtures for all code-task tests.

## 6. Actual interrupted destructive restore

This is the remaining maintenance case where expert assistance is appropriate:

1. Stop application and administrative writers; prevent automatic restarts from mutating the target during offline work.
2. Preserve exact journal/job/artifact generation, paired safety DB/media, old/new uploads/variants, configuration and sensitive backups.
3. Establish DB execution quiescence independently; closing a socket/dead PID alone is not cancellation proof.
4. Determine completed boundaries and rehearse recovery on an explicitly approved isolated copy. Do not blindly import a safety dump or replay a wipe because an HTTP response was lost.
5. Restore/verify DB and media to one consistent generation, with current schema/runtime credentials/auth/cache consequences reviewed.
6. Only after verified terminal outcome and operator authorization, retire specific restore ownership/evidence through the supported offline procedure; start exactly one app and check readiness.

Keep the existing [offline restore recovery guidance](../backend-hardening/operations.md#offline-recovery-no-public-unfence-endpoint) until implementation reconciles it. This package removes its application-writer-only application, not the need for careful actual restore recovery. No public unfence endpoint, automatic SQL rollback on startup or blanket storage deletion is introduced.

## 7. DB execution bounds and resource settings

The ordinary uncertain-write, new-app-process and exact-observed-abandoned-job holds are **10 minutes**. The last may begin when a dead app/CLI job is first observed, adding a further finite job-only wait. DB query/transaction server timeouts must be below this bound; guarded disposable DBs explicitly use **30 seconds** for both. Expired uncertainty records are informational and left unchanged to avoid unlinking newer CLI publication. Unknown/remote/partial job records or interrupted reclamation can require a narrow offline job-only remedy, never a generic startup DB-consistency assertion. SDK response deadlines and client disposal are different from server execution limits. Document the actual separately managed DB configuration and any finite new-process destructive-job hold/equivalent. This affects backup/restore admission, not normal readiness, and must explain automatic expiry.

Retain existing finite app/DB/native/image/KDF/stream/disk/query/cache budgets. No raising limits or heap as a substitute for correct admission/drain. Current Compose grace is 45 seconds and Nitro shutdown timeout is 15 seconds; reconcile final bounded coordinator values and keep useful draining time even though there is no writer receipt to release.

## 8. Downgrade and rollback

No promise that an old image understands new job/journal semantics. Preserve DB/media/config/security receipts and inspect outstanding destructive state. Test image/schema/credential/backup compatibility on an approved isolated copy before downgrade; old writer-lock requirements may reappear in an old image.

Do not manufacture a writer receipt, reset a layout marker, remove safety evidence or restore insecure historical auth/runtime code to make downgrade succeed. Use an operator-approved compatible image/data pair. Implementation completion is not downgrade/deployment authorization.
