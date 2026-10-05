# Backend hardening: operations and release runbook

**DRAFT — planned behavior, not instructions claiming the current application is fixed.** Finalize in REV-5.2 after implementation and local verification. Task/evidence status is in [progress.md](./progress.md); existing deployed logging behavior remains documented in [logging operations](../logging/operations.md).

## 1. Current operator cautions

Until the relevant tasks are complete:

- REV-1.1 now revokes sessions/devices using current account epochs locally. Deployment still requires coordinated schema/readers/writers and explicit legacy-cookie reauthentication acceptance.
- Do not place private media behind a public cache assuming the current application headers are safe; already cached public responses need explicit proxy/CDN invalidation.
- REV-1.4 now shares an IP-pinned, deadline-bounded SSRF transport locally. Restrict deployed outbound connectivity independently and verify the deployment/module boundary before release.
- Avoid concurrent large media jobs and large restores on constrained memory; streamed backup creation does not imply streamed restore.
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
| Backup expanded-byte/import size limits | pending DB-side measurements |
| Runtime scoped user / privileged maintenance identity | pending verified permissions |
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

On recovery-required: stop writers, preserve the receipt/owned claim temporary file, DB/media snapshots and maintenance artifacts, verify the last committed owner/claim on an approved copy, then use reviewed owner/restore recovery under operator authorization. Do **not** delete/edit the receipt or insert markers to make bootstrap available, and do not run the old overwrite-capable setup code alongside this release. An uncommitted reserved claim intentionally requires recovery rather than accepting another owner's password. General restore phase journaling/draining/readiness remains REV-2.2; this receipt protects bootstrap only. Approved-copy, Linux crash/fsync, deployed browser/module/proxy and every release sign-off gate remain pending.

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
