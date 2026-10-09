# Spec 05: Streamed backups, exclusive maintenance and recoverable restore

> **Approved maintenance boundary amendment:** [jobs and restore spec](../../maintenance-simplification/specs/02-jobs-and-restore.md) now requires no persistent app writer, safe automatic handling of verified pre-destructive interruption/terminal state, and durable recovery for destructive/ambiguous restore only. Job serialization, full foreground/background drain, streams/validation, paired rollback and auth/cache refresh below remain applicable. The working tree implements that boundary; current evidence and remaining production/module/fault gates are in maintenance progress.

Tasks: **REV-2.2, REV-2.3, REV-2.4**. Findings: F-07, F-11, F-16, F-24.

## 1. Baseline and non-negotiable behavior

Backup creation already streams HTTP export through gzip to disk; external archives already stream to temp files. Preserve those properties. Restore, staging validation and consolidated downloads currently materialize whole dumps. Maintenance fences only new ordinary HTTP requests, not active mutations or background writers. Disk lock recovery overwrites stale/unreadable locks non-atomically.

Access log files are **not** part of DB/media backups. Preserve the separate logging migration receipts and runbook. Do not reintroduce the retired backup access-log setting.

## 2. Job owner and durable journal (REV-2.2)

A job has an unguessable owner token, ID, kind, phase, start/update time, application generation and paths of owned artifacts. Persistence lives outside the DB being wiped.

- Reserve in-process ownership synchronously before the first `await`.
- Acquire disk ownership atomically. An empty/unreadable recently-created lock is not automatically stale; it may be mid-publication.
- Recovery uses an atomic ownership protocol (e.g. exclusive directory plus verified owner record and serialized reclamation), not unconditional `writeFile(..., flag:'w')` or check-then-unlink without protection.
- Releasing an old job verifies token ownership and cannot remove a successor's lock.
- A wall-clock TTL alone cannot authorize stealing a live long restore. If remote/multiple writers are unsupported, fail explicitly rather than pretending hostname/PID/TTL proves safety.
- Journal transitions and critical artifact paths are written atomically and synced as appropriate for Linux persistence. Define restart handling for every state.
- A crash after destructive work begins leaves maintenance closed on restart until rollback/verification/operator recovery, not merely until the stale PID is replaced.

## 3. Shared write barrier (REV-2.2)

Introduce mutation leases with an exclusive restore owner context. Maintain a complete inventory of writers:

- User/profile/password/setup/MFA/device mutations.
- Post/version/lock/taxonomy/media/reference/settings mutations.
- Analytics events/session counts, logging DB writes, retention, cleanup, deferred migrations/search backfills and regeneration.
- Already-started operations and work that spans both DB and filesystem.

Entering restore closes new mutation admission, pauses background starts, drains existing leases and resolves pending best-effort logging under a finite deadline. If drain fails, abort **before** wipe; do not force-open destructive overlap. The restore's own writes use the exclusive owner lease and do not deadlock through ordinary admission.

Define lock ordering once (job owner -> barrier -> subsystem admission -> DB/FS) and test inversion/cancellation. Reads that could observe inconsistent DB/media are fenced during destructive phases.

## 4. Maintenance API and shutdown (REV-2.2)

- Allow exact liveness/status/static routes needed for recovery. Do not exempt all `/api/auth` or `/api/admin/backups` mutations by prefix.
- Status/recovery readiness comes from the persistent journal, not only a DB backup row that disappears during wipe.
- Reading maintenance status still needs authentication without treating a stale cookie as current superadmin. Design a narrowly scoped pre-validated restore-owner status capability or equivalent mechanism; it cannot authorize other APIs or survive beyond the job/recovery policy.
- Ordinary login/setup/password changes are unavailable during destructive cutover. No missing tables can reopen setup.
- Shutdown stops starting new jobs, waits for a bounded safe checkpoint, flushes the journal and never removes an ownership marker falsely implying a clean finish.
- Post-restore optional rebuilds have generation guards and participate in shared admission. Another restore cannot race an old regeneration job publishing files.

## 5. Streaming interfaces and quotas (REV-2.3)

Use file paths and fresh stream factories rather than reusable consumed streams or Buffer arguments:

```ts
// Illustrative contracts; adapt names to existing helpers.
type DumpSource = { open: () => NodeJS.ReadableStream; knownBytes?: number }
type ImportSummary = { total: number; ok: number; errorCount: number; errors: string[] }
```

- HTTP export -> gzip -> owned temp file -> atomic ready publication.
- Archive read -> streaming gunzip with expanded-byte cap -> staged SQL file or HTTP import body.
- Native Node fetch request streaming uses the supported `duplex: 'half'` contract. Confirm abort/backpressure on Node 22.
- HTTP import responses must be incrementally parsed or bounded by a documented response cap. Error samples/counts are finite. HTTP 200 with malformed/empty/unexpected statement results is not silently accepted as success.
- The SurrealDB server may itself buffer `/import`; app streaming is not proof of bounded DB memory. Measure and enforce an import-size limit compatible with server resources. If chunking is necessary, use a supported export/import protocol or real SQL parser preserving statement/transaction boundaries, **never split on semicolons or lines**.
- Expanded SQL/media, archive entry count/size, active temp bytes, job count, elapsed time and free-disk reserve have finite validated limits. Implementers choose/record defaults from deployment evidence; do not infer expansion size from compressed Content-Length.
- Preflight decompression and integrity before wipe. Recheck disk headroom as bytes arrive. Include staged dumps, safety dumps, old/new media and compressed temp artifacts in the reservation.
- Ready archive downloads stream files. Consolidated downloads are admitted heavy jobs producing a temp/ready file; no synchronous gzip and no bypass of the backup-family resource budget.
- Avoid collecting every original path/hash/manifest into RAM at arbitrarily large library size: use bounded manifests/iterators or a documented finite library/artifact limit. Chain ancestry is cycle-checked and depth-limited.

## 6. Validation, partial snapshots and trust (REV-2.3/2.4)

Staging verifies that an artifact can import; it is not a security sandbox when ROOT can execute arbitrary SQL. Backups are administrator-controlled executable data. Document that trust boundary, protect archives as credentials, and do not claim regex checks make hostile SQL safe. If hostile import is a product requirement, isolate it at the DB process/capability boundary as a separate design.

For partial snapshots, explicitly define **replacement of selected tables**, not additive overlay:

1. Import base into disposable staging.
2. Remove/replace exactly the selected table contents/definitions according to verified SurrealDB export semantics.
3. Import partial snapshot and validate expected state.
4. Preserve nonselected base tables; selected records deleted since the base must remain absent.
5. Verify cross-table graph references/constraints and document behavior for omitted related tables. Reject incompatible combinations rather than reporting a successful inconsistent restore.

Honor `tables: []` as empty selection; it never means all tables. Verify export user/access/analyzer artifacts and runtime-account effects. Use strict manifest schemas and bounded metadata; snapshot-era manifests remain compatible or get an explicit unsupported-version error.

## 7. Restore phases and rollback (REV-2.4)

Required state transitions, with durable journal evidence:

1. Own job; acquire/drain fence.
2. Resolve bounded/cycle-safe chain; validate archive structure/checksums; stage SQL and media; verify disk budget.
3. Take streamed verified current-DB safety snapshot and prepare media safety snapshot/rename plan. If safety is disabled by an existing setting, explicitly reject automatic destructive restore unless the operator supplies an approved alternative recovery mode; record any compatibility change.
4. Mark destructive phase before wipe. Use explicit privileged client/HTTP identity, not accidental runtime ROOT fallback.
5. Wipe/import; validate statement outcomes and representative content/schema counts. Table existence alone does not prove restored records.
6. Apply safe current schema, reprovision/verify runtime credentials, invalidate/reissue authentication epochs so old/restored cookies cannot authorize unexpectedly, recycle runtime connection.
7. Swap staged originals, regenerate or correctly record variants, reconcile backup history using pre-wipe saved metadata, refresh/invalidate all relevant settings/visibility/auth/cache state.
8. Verify DB/media consistency, persist committed state, then release ordinary service. Remove safety artifacts only after this point.
9. On failure after wipe, restore DB **and** media to the same safety generation. Verify rollback before reopening. If either fails, preserve safety artifacts and journal, report recovery-required and stay fenced.

Metadata-only warning versus consistency failure must be explicit. Do not overwrite a rollback error with a later successful backup-row update. Avoid a catch path that queries the already-replaced backups table instead of using the pre-wipe history snapshot.

## 8. Archive and upload hardening (REV-2.4)

- Tar extraction accepts only intended regular original files and necessary directories; reject symlinks, hardlinks, device entries, traversal, absolute paths and unexpected names. Filename shape alone does not establish entry type.
- Enforce actual extracted-byte/entry caps, verify checksums/paths, extract into a new owned stage, and publish only after validation. Never test untrusted extraction in live uploads.
- Empty-media full/incremental/partial backups must produce a valid empty archive. Historical logging progress records a real `tar.c(..., [])` failure; turn it into a regression rather than assuming the current helper works.
- Multipart backup imports reject duplicate db/media/manifest parts and excess parts, count fields, and settle/close all pending writes before removing staging. Oversized manifests are explicitly rejected, not silently truncated into a different document.
- Cleanup of failed upload streams cannot race writers still targeting deleted temp directories. Partial archives are never registered ready.

## 9. Acceptance and fault matrix

- [ ] Concurrent fresh/stale/partially-written lock contenders yield exactly one owner; old release cannot delete new lock.
- [ ] Restore blocks setup and active/background writers; failed drain aborts before wipe.
- [ ] Crash/restart at every phase resumes safe recovery or remains fenced.
- [ ] Large compressed SQL/media stays within separate app RSS, DB RSS and disk budgets; expansion bomb fails before wipe.
- [ ] Error/malformed HTTP 200 import results fail validation; no false success.
- [ ] Full/incremental/partial/empty-media artifacts round trip on 3.2.5, including deleted selected-table rows and historical schema.
- [ ] Disk-full, broken streams, missing parent, parent cycle, corrupt gzip, extraction errors and credential changes preserve recovery artifacts.
- [ ] Restored historical-month variants resolve; settings/private-mode caches and sessions cannot retain the pre-restore authorization state.
