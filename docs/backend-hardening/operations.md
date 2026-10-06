# Backend hardening: operations and release runbook

**DRAFT RELEASE RUNBOOK — Phases 0–2 are implemented/tested locally, not deployed or release-approved.** Phase-specific sections below describe implemented controls; later-phase/deployment placeholders remain for REV-5.2. Task/evidence status is in [progress.md](./progress.md); existing deployed logging behavior remains documented in [logging operations](../logging/operations.md).

## 1. Current operator cautions

Until the relevant tasks are complete:

- REV-1.1 now revokes sessions/devices using current account epochs locally. Deployment still requires coordinated schema/readers/writers and explicit legacy-cookie reauthentication acceptance.
- Do not place private media behind a public cache assuming the current application headers are safe; already cached public responses need explicit proxy/CDN invalidation.
- REV-1.4 now shares an IP-pinned, deadline-bounded SSRF transport locally. Restrict deployed outbound connectivity independently and verify the deployment/module boundary before release.
- Phase 2 restore now streams SQL and fences writes. Its finite limits are compatibility boundaries, not a constrained-production memory guarantee; media upload/analytics/logging resource lanes remain pending.
- Do not remove migration markers or receipts to bypass a failing startup. REV-1.6 now refuses an unrecognized media layout without resetting the catalog/settings; see the recovery note below.
- Treat SQL backup artifacts as executable administrator-controlled input and protect them as secrets. Do not validate untrusted imports against a production DB process.
- No review/handoff activity authorized a production migration, purge, image change or restore.

These are containment cautions, not a complete operational mitigation plan. Use the owner/operator's approved change process.

## 2. Intended deployment model

The initial hardening target is one Nitro process/app writer with a persistent storage mount and a separately managed stable SurrealDB 3.2.x service (local/default fixture pin 3.2.4). The Nginx example overwrites inbound X-Forwarded-For with its socket client IP; retain that behavior and prevent direct public access to the app port.

Before release record:

| Item | Value to fill after implementation/rehearsal |
|---|---|
| Application image/revision | pending |
| Supported Node 22 minor / installed Nuxt/SDK/Sharp | pending |
| SurrealDB image/version | stable 3.2.x; 3.2.4+20260803.93ab219 tested locally; deployment build pending |
| App CPU/memory / DB CPU/memory | pending measured profile |
| Persistent media/log/backup/journal/temp paths | pending actual mounts |
| UID/GID, free-disk reserve and temp quota | pending |
| Image/KDF/query/log/cache budgets | spec 00 proposes targets; final actual values pending |
| Backup expanded-byte/import size limits | local defaults below; 101,476,675-byte fixture measured separately in driver/DB; deployment profile pending |
| Runtime scoped user / privileged maintenance identity | local 3.2.4 EDITOR/ROOT matrix below; deployment identities pending |
| Restart/migration/session invalidation effects | pending exact release behavior |

Do not copy proposed spec budgets into production without validating the supported hardware/workload envelope.

### Outbound policy (REV-1.4; local implementation)

One app process admits at most 4 active outbound operations, with no waiting queue or per-host agents. Image import allows 3 redirects, at most 10 MiB actual response bytes and 15 seconds overall; headers are capped at 16 KiB, with a secondary 5-second inactivity cap. Webhooks refuse redirects, destroy status-only bodies and use a 4-second overall deadline. All resolved addresses must be global; conservative special-purpose/transition-address denial may reject formerly accepted URLs. Embedded credentials and URLs over 4096 characters are rejected. HTTPS verifies the original hostname with SNI/Host intact; never disable TLS verification.

Automatic security alerts allow 2 active deliveries and zero waiting payloads. Excess arrivals are dropped (finite scalar diagnostics via `securityAlertDiagnostics`); payload username/IP/user-agent/reason fields are clipped. These are best-effort alerts, not durable auditing. No distributed/multi-writer correctness is claimed. Validate actual egress/firewall/DNS/proxy behavior before operator release approval.

### Rate/password-work policy (REV-1.3; local implementation)

Supported mode is one app writer. The limiter is an atomic local map with 10,000 hashed keys and a 30-second sweep; untouched keys expire, saturation denies instead of evicting live protection. Restart resets budgets; require coarse trusted-reverse-proxy abuse protection and no directly public app port. This is not multi-host/distributed limiting. Login/unlock/MFA separately reserve IP and account/target limits of 5 attempts per 15-minute fixed window before work. Success and MFA-pending do not reset windows. Search/analytics keep their existing endpoint budgets/204 drop semantics.

All native Argon2 operations share 2 active/16 waiting slots, at most 2 seconds waiting, and preserve the 64-MiB/time=3/parallelism=4 hash cost. Admission overflow/wait expiry is 429; shutdown is 503, with Retry-After. Running native work cannot be cancelled: its slot remains occupied until actual completion, including after HTTP abort or a 5-second shutdown drain timeout. Password/verification inputs are capped at 200 characters, stored PHC strings at 512, and verification refuses costs exceeding the supported generation budget. Backup code generation hashes sequentially.

The old `storage/rate-limit` files are no longer read or written; they are deliberately **not automatically deleted**. If removing legacy counter files, an operator must stop the old writer, back up/verify the dedicated legacy directory and remove only those confirmed limiter artifacts offline under the approved change process. Never delete broader storage or migration receipts. No tests/review authorized this cleanup.

### Identity migration/cutover (REV-1.1; locally implemented)

Cookies authorize only when the current active account's random epoch matches the sealed **private** `secure.authEpoch`; current roles win. Multi-user-off mode accepts only `users:admin`, never promotes viewer/author cookies. Identity DB failures are 503, including optional/session reads. Legacy cookies and trusted devices without an epoch must reauthenticate. Role/active/password/MFA security writes rotate epochs; profile writes cannot renew them. Self password/MFA security changes currently revoke the caller too, requiring re-login; trusted-device epochs are not silently preserved.

Boot adds nullable epoch fields, then conditionally migrates at most 100 legacy IDs per page with fresh 192-bit Node randomness. It preserves already assigned epochs after interruption, verifies no missing-epoch rows remain, and refuses malformed/non-progress pages. No marker edit bypass exists. If migration fails, keep old/new writers stopped, preserve backups/evidence and fix the underlying schema/connection/record issue on an approved isolated copy before retry. Invalid nonempty epochs fail authorization rather than being silently retrofitted into cookies.

Stop all old app readers/writers for cutover; an old image still trusts legacy cookie roles and is not safe to overlap or roll back blindly. Verify consistent DB/media/config backups and rollback compatibility before release approval. [Route audit](./auth-route-matrix.md) distinguishes superadmin/content/admin/self/pending/public lanes; deployed Nitro/module/browser/proxy behavior remains to be exercised.

### Media/ZIP privacy policy (REV-1.5; locally implemented)

All originals/variants/downloads use `Cache-Control: private, no-store` and append `Vary: Cookie`, including currently public media because stable URLs have mutable visibility. Public-to-private settings do not retract already distributed bytes. Purge preexisting public CDN/proxy/IPX entries under operator approval before cutover; test actual deployed cache boundaries. IPX refuses media/API-media source transformation (including encoded/absolute forms); use authorized original/variant URLs instead. Ordinary IPX assets remain supported without public immutable caching.

ZIP selection is all-or-nothing: a missing or unauthorized selection returns generic 404 without private metadata. The response contract remains `{type, url}`. New ZIPs have random names but require **current owner + account epoch + expiry + current source policy**, not filename secrecy. At most 200 unique hashes, 1 active/0 queued build, 8 ready streams, 32 ready artifacts, 512 MiB source bytes, 1 GiB artifact bytes and 2,000 directory entries are admitted. Jobs have a 120-second deadline, temporary files and completed ZIP/metadata publication; metadata reads cap at 32 KiB. Archive expiry clamps the existing cleanup-hours setting to 1–24 hours. Native/fs work is not falsely freed before streams close. New files request 0600 and directories 0700; verify actual mount/UID/platform enforcement before release.

Completed owner/epoch/policy metadata lives next to the archive as `.zip.json`; partial `.part` artifacts are never downloadable, active jobs are skipped by cleanup, and stale new parts can be removed after 10 minutes. New ready artifacts expire according to recorded metadata. Legacy archives lacking valid owner metadata are **inaccessible and not automatically assigned to an actor or deleted**. Stop old writers and perform operator-approved offline cleanup of confirmed old download artifacts after verifying backup/ownership; unknown storage entries/oversized catalogs can cause quota refusal. Never clear broader media/storage or alter metadata to bypass authorization. Linux crash/rename/disk-full behavior, deployed module/IPX/browser/proxy smoke and production release approval remain pending.

### MFA/setup/origin policy (REV-1.2; locally implemented)

**Production requires `NUXT_APP_ORIGIN`**, e.g. `https://blog.example.com` or the actual non-default public port. `APP_ORIGIN` is the build-time alias; deployed Nitro overrides use the `NUXT_` prefix, as in the production sample. Startup rejects a missing/invalid canonical origin. Do not derive it from inbound forwarding headers. Browser mutations must have exact scheme/host/port Origin and acceptable Fetch Metadata; auth/login/logout/setup are not exempt. A metadata-less API mutation client must explicitly send `X-PandaBlog-Client: non-browser`, manually supply its owned credentials/cookie if needed, and send JSON for auth bodies. Cross-origin requests are still rejected, including clients that add that header. No credentialed wildcard CORS is supported. Local development may infer a direct loopback origin only; non-loopback development must configure it too.

Auth/setup/profile/password/MFA/device and admin credential payloads have 8-KiB pre-buffer JSON caps and a 10-second ingestion deadline; archive selection has a 16-KiB cap. All shapes/strings/booleans are checked before expensive work. Self MFA enrollment accepts a five-minute sealed `secure.authenticatedAt` credential proof or a rechecked current password; profile timestamps do not renew proof. Forced epoch-bound enrollment is a narrow pending exception. Enrollment has a five-minute epoch-bound secret window; activation claims its accepted OTP step. Recovery hashes are conditionally consumed once, TOTP steps increase monotonically, and a future accepted step prevents earlier codes until the clock catches up. After enrollment/password/MFA security changes, sessions/devices reauthenticate; a just-used enrollment OTP cannot be reused for a new login. Save recovery codes, then use the next authenticator code or an unused recovery code.

AES-256-GCM v1 secrets stay compatible. One asynchronous scrypt derivation caches only one 32-byte key/source fingerprint per process. Use a strong random dedicated `NUXT_MFA_SECRET`; fallback remains the session key for compatibility. Runtime key-source churn fails rather than creating a key map. Rotate only with a verified backup and planned restart/reenrollment/recovery; old ciphertext does not magically become compatible with a new key. Never log keys, plaintext secrets, recovery hashes or account epochs.

**Persist `storage/setup-authority.json` outside the DB** (the supplied whole-storage bind mount already does). It is an immutable one-time bootstrap receipt, not an auth token or REV-2.2 restore journal. Existing owner/completion/legacy credential evidence seals bootstrap on startup. New setup reserves a receipt exclusively before the one atomic owner+DB claim transaction; losers never update the winner's password. Verified matching DB claim+owner epoch can reconcile a committed response loss. A reserved/corrupt/mismatched receipt, missing/disabled owner, emptied initialized DB, DB outage or unresolved maintenance lock is recovery-required, never open setup. File sync and parent-directory sync are used where supported; Windows directory-fsync limitations are not a Linux power-loss approval.

On recovery-required: stop writers, preserve the receipt/owned claim temporary file, DB/media snapshots and maintenance artifacts, verify the last committed owner/claim on an approved copy, then use reviewed owner/restore recovery under operator authorization. Do **not** delete/edit the receipt or insert markers to make bootstrap available, and do not run the old overwrite-capable setup code alongside this release. An uncommitted reserved claim intentionally requires recovery rather than accepting another owner's password. The Phase 2 restore journal/barrier is separate; this receipt still protects bootstrap only. Approved-copy, Linux crash/fsync, deployed browser/module/proxy and every release sign-off gate remain pending.

## 3. Pre-release checklist

1. Read the current progress release-gate table. Require REV-5.1 evidence on Node 22 and isolated stable 3.2.x, not only Node 24 unit tests.
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

### Media startup recovery (REV-1.6; locally implemented, not release-approved)

The read-only media preflight runs before schema synchronization and ownership backfills. A current `2026-05-image-variants-v2` marker is retained. Only a missing marker with empty `files`, `media` and `asset` tables initializes the marker; it never resets custom media settings. A missing marker with records, an old marker or a corrupt marker refuses startup, preserving records and originals. There is no verified historical converter in this release.

On refusal: stop the app writer, preserve the DB and media mounts, obtain verified backups, and rehearse a layout-specific conversion/verification on an explicitly approved isolated copy. Compare catalog paths, originals and variant metadata before/after; do not insert the current marker to silence the check. Obtain a reviewed converter and operator approval before attempting a production migration. An interrupted fresh marker write is safe to retry; a historical layout remains refused until a verified migration exists. Rolling back to the former initializer can reintroduce destructive reset and is not a safe recovery shortcut.

## 5. Database and restore safety (Phase 2, locally implemented)

### DB identity, admission and deadline contracts

The shared runtime client uses DATABASE EDITOR when both configured runtime credentials exist. Partial credential configuration refuses; legacy ROOT fallback emits one non-secret warning. Boot, wipe, security DDL and credential provisioning use separately owned ROOT clients; HTTP export/import use explicit ROOT credentials and namespace/database headers, never inbound credentials. Real 3.2.4 EDITOR acceptance: ordinary CRUD, `INFO FOR DB` and tested table DDL succeed; database/user provisioning fails. This is not a claim that every EDITOR DDL fails.

Handshake stages each have a 10-second **response** deadline; close waits at most 2 seconds. Late uncancellable connects remain owned and are closed after settlement; failed/pending disposal retains the five-client budget. Shared initialization is single-flight with 250-ms exponential failure backoff capped at 30 seconds plus up to 20% jitter. The 30-second keepalive captures its exact generation, never overlaps probes, and pauses under maintenance. Nitro close stops admission/timers and drains for 5 seconds before bounded disposal.

Query lanes: foreground **8 active / 32 waiting**, background/ROOT **2 active / 8 waiting**, 2-second admission wait. Default SDK response deadline is 15 seconds (validated 1–300,000 ms). A caller deadline/abort does **not** release still-executing work. Raw SDK 2.0.3 queries have no per-query AbortSignal/cancel method; supported transaction cancel is not cancellation of an arbitrary already-dispatched script or HTTP import. Real acceptance demonstrates a late CREATE still commits after the caller timeout. Auth rejection and a first `SELECT` token do not authorize replay. Entire-script retry metadata defaults to `never`; authored read helpers classify their known read scripts, and only explicitly read-only/idempotent operations can reconnect/retry once. Dedicated ROOT is never retried through runtime credentials. SDK `.responses()` inspection preserves the actual transaction error rather than the first cancelled-statement mask.

`TIMEOUT` is applied only in an authored/supported statement, not appended to arbitrary scripts. Server-side `SELECT ... TIMEOUT` is verified on 3.2.4 and reported separately from response-only expiry. Operators should explicitly bound the deployed DB using its supported `--query-timeout` / `--transaction-timeout` settings (initial rehearsal target: 5 minutes), with independent DB memory limits. Closing fetch/socket is not execution-cancellation proof. Unclassified/write SDK transport ambiguity persists `storage/backups/.uncertain-writes.json`; destructive admission is refused until offline quiescence/recovery is verified. Do not blindly repeat counters/CREATE/RELATE/wipe after an uncertain response.

### Persistent ownership and resource defaults

Persist the entire storage root, including `setup-authority.json`, backup ownership directories, journal and safety artifacts. [Writer inventory](./writer-inventory.md) identifies all covered request/background/native/FS lanes. Exactly one writer is enforced with `.writer.lock`; multi-host/worker deployments and external concurrent DB writers are unsupported. Clean shutdown removes ownership only after verified drain. **Unclean writer restart requires offline inspection**; a dead PID cannot prove the server stopped its old queries. Interrupted restore/uncertainty journals start health/status-only recovery with boot migrations disabled. Legacy `.job.lock` files, corrupt/empty/remote owners and abandoned `.ownership.guard` are not automatically overwritten or TTL-stolen.

| Resource | Implemented default / meaning |
|---|---|
| Backup-family jobs | 1, no queue; create/import/restore/consolidation/delete/prune share ownership |
| Ready download streams | 8, no queue; 5-minute transfer deadline; private, no-store |
| Expanded SQL/import body | 128 MiB; finite DB-compatible cap, not arbitrary-size restore |
| Compressed DB upload/archive | 256 MiB; actual expansion is checked independently |
| Expanded/compressed media tar | 2 GiB each, including tar framing; at most 20,000 originals / 40,000 entries |
| Manifest / HTTP statement results | 4 MiB / 1 MiB; strict arrays/statuses; max 10,000 statement responses, 8 clipped error samples |
| Snapshot profile | Up to 200 tables; exact counts + first 3 stable-ID record samples + relation-reference validation |
| Backup history / ancestry | 128 records, 16-MiB serialized metadata; 64-parent depth, cycle/missing-parent refusal |
| Free-disk reserve | 512 MiB; preflight plus rechecks as streams arrive. Include staged/safety SQL and old/new originals/variants |
| Transport/file pipelines / restore | 5 minutes per pipeline/HTTP operation; 30-minute restore checkpoints/variant deadline |
| Restore image regeneration | Sequential; 32-MiB input and 40-million-pixel check per image, 2-GiB variant output budget |

No dump-sized buffers, sync gunzip/gzip or semicolon-splitting SQL parser are used. Files are staged exclusively and streams have backpressure. Native/fs operations which cannot cancel are not falsely freed: a stuck operation remains owned/fenced rather than authorizing overlap. Media swap requires regular directories on the **same filesystem supporting directory rename**; separately mounted upload/variant mountpoints need an approved-copy rehearsal or another reviewed publication design. POSIX file/directory sync is used where supported; Windows directory-sync skips are not Linux power-loss acceptance.

The 128-MiB SQL cap is a deliberate conservative compatibility boundary based on the local 96-MiB-class driver/DB measurement, not proof of an arbitrary dump larger than a 1-GiB app budget. Large historical artifacts refuse before wipe. Raising budgets requires DB-side/resource measurements and reviewed changes, not a larger Node heap flag. Generic proxy upload limits may be smaller; do not remove limits broadly to accommodate backups.

### Normal restore and status

1. Verify provenance, SHA-256, layout compatibility and disk headroom on an approved isolated copy. SQL archives execute with ROOT; staging is **not a sandbox for hostile SQL**. Treat dumps as credentials. External registration accepts self-contained full snapshots only; malformed/partial/incremental manifests reject instead of losing their ancestry. Symlinks, hardlinks, devices, traversal, unexpected/duplicate tar entries and expansion bombs reject in an owned stage.
2. Current superadmin POSTs `/api/admin/backups/<id>/restore` with `{confirm_token: 'RESTORE_<id>', mode: 'replace'}` (8-KiB body cap). Response 202 includes `status_token`. Poll only exact GET `/api/admin/backups/status` with `X-PandaBlog-Restore-Status: <status_token>` during maintenance. The capability is hash-persisted, expires after 24 hours, is confined to that restore's status, and cannot authorize login/setup/download/other jobs. Do not put it in URLs/logs. Without it a stale cookie cannot authorize status while closed; process health remains `/api/health`.
3. The job reserves ownership, persists `.restore-journal.json`, closes new work, drains existing leases, resolves a bounded chain, validates SQL/media in staging, and takes/verifies current SQL plus a media rename plan before wipe. `validate_before_restore=false` does not skip this safety boundary; `auto_safety_snapshot=false` rejects automatic restore and requires an approved offline recovery mode. Unsupported media markers and historical nonempty `access_logs` require their reviewed conversion/receipt-verified migration on a copy, never marker bypass/deletion.
4. Selected partial tables **replace** their base tables, including deleted records. Empty selection never means all tables. Nonselected base state must stay unchanged; dangling or changed related graph state rejects and requires selecting compatible related tables. The worker verifies imported counts/representative records, applies additive current definitions without unrelated REMOVE/UPDATE/index replacement, reprovisions/verifies configured runtime credentials, rotates every account epoch, deletes trusted devices and recycles the runtime client.
5. Staged originals replace uploads via a journaled rename plan. Variants regenerate while still exclusively owned, using the original year/month and persisted new metadata. No detached old-generation rebuild can publish after release. Settings/security/log caches refresh, Nitro post keys change generation, and service reopens only after committed/rolled-back journal durability. Backup history is taken before wipe and reconciled from that saved generation, not a replaced table. History reconciliation failure is conservatively fatal, not silently reported as clean success.
6. Successful commit or verified paired DB/originals/variants rollback removes the owned safety directory **after** durable verification/release. Both outcomes invalidate previous cookies/devices; sign in again using the restored account credentials/MFA. Restore intentionally returns account/settings data to snapshot-era values; it does not restore prior cookie authority. Public bytes already distributed or cached at a proxy/CDN cannot be recalled by app invalidation; purge/rehearse those boundaries separately.

### Offline recovery (no public unfence endpoint)

- If destructive work or rollback fails, or execution is ambiguous, the worker preserves `.restore-<owner-token>/safety.surql`, old originals/variants, stage artifacts, owner markers and journal and remains fenced. `recovery_required` describes a closed recovery condition; `restore_blocked` also identifies ordinary-service uncertainty which forbids new heavy jobs. A timed-out HTTP/SDK write may still execute: do **not** start rollback against it automatically.
- Stop all app writers and independently establish DB execution quiescence (including stopping/restarting the separately managed DB when needed under operator approval). Preserve current DB/media/config and every journal/receipt/safety artifact first. Never use a PID/TTL or deleting a lock as proof of consistency.
- Inspect the bounded journal and recorded artifact paths/owner generation offline. Rehearse verified import of the safety SQL and matching original/variant generation on an explicitly approved copy. A crash between renames is resolved from actual path existence and content hashes; no DB+filesystem atomicity or automatic resume is claimed.
- If recovering pre-wipe or nonrestore ownership, still verify any pending server writes and artifact/metadata state. Unreadable/legacy markers and abandoned guards require inspection, not overwrite. Bootstrap `setup-authority.json` is monotonic and must never be removed to reopen setup.
- Only after DB/media/auth/config/cache consistency and server quiescence are independently verified may an operator archive the **specific** completed/aborted journal and ownership/uncertainty markers under the approved offline procedure and restart one writer. There is no recovery CLI or ROOT HTTP endpoint in this release; do not invent blanket storage cleanup commands. Preserve safety data until the recovered deployment is accepted.

Linux crash/fsync/rename/mount/disk-full, actual Nitro/module/browser/proxy, constrained mixed-load and production-copy/operator release acceptance remain pending.

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
