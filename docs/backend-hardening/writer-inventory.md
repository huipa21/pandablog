# Phases 2–3 writer and maintenance inventory

> **Current working-tree lifecycle:** [maintenance simplification](../maintenance-simplification/progress.md) removes lifetime app ownership and ordinary-crash expert recovery. This inventory describes current readiness/restore admission; exact evidence and build/operator gaps remain in that ledger. Earlier phase evidence is historical, not a new release pass.

REV-2.2 / REV-2.4 / REV-3.1–3.3, local implementation. Supported topology is **one Nitro writer and one persistent storage root**; arbitrary external DB writers and extensions bypassing these interfaces are unsupported. This inventory is not production acceptance.

## Admission and ownership

`server/plugins/00-maintenance.ts` synchronously closes readiness admission and wraps the actual H3 application handler promise using `maintenance-handler.ts`. It validates config, performs bounded restore-state preflight and then allows private required initialization, without reading/writing application ownership. `startup.ts` retains one handled boot flight, DB retries and ten-second shutdown; `dev-handoff.ts` drains live dev Workers through process-local messages, never disk authority. A socket disconnect does **not** release a still-running handler. Ordinary API/SSR operations, including reads which update counts or return cached data, hold leases until actual handler settlement. Error responses cannot bypass the fence. Restore POST alone enters without an ordinary request lease, after which its handler validates current superadmin identity before acquiring ownership. Concurrent restore triggers are denied once closed.

Every `queryDb` execution additionally holds a lease and subsystem admission until SDK settlement, even after its caller's response deadline. The only raw application query outside that wrapper, `createSetupOwner`, separately retains a lease on its complete `.responses()` promise. Its CREATE-only durable setup reservation also survives restart. SDK transport ambiguity on an unclassified/write script records a finite ten-minute job-only quiescence hold outside the DB. No write replay/cancellation proof is claimed; ordinary traffic/restart remains available. New app processes and observed abandoned CLI/jobs also cover missing-marker crash execution under documented server timeouts.

| Writer / reader family | Coverage |
|---|---|
| Login/logout, setup, profile/password, MFA, trusted devices, users/roles | Whole H3 promise; query leases; raw setup transaction lease and monotonic receipt |
| Posts, versions, locks, blocks, taxonomy, media references, folders/tags, settings | Whole H3 promise and each query; media dashboard uses scoped aggregates/bounded lists; media source reservations precede post/cover/block/avatar/version-restore/public-setting saves; historical reservations remain until source deletion; metadata SQL rechecks readiness/ownership |
| Originals/variants/image import/upload, ZIP construction and download | Whole H3 promise through native/FS/stream completion; 5 owned staging requests and 1/4 native image slots; publication owns DB claim before final paths; no socket-close early release |
| Analytics tracking/session/view counters | Whole H3 promise and actual SQL settlement |
| Analytics rollup/retention scheduler | Phase 4 maintenance admission + `writeBarrier.run(..., true)` across each bounded operation; readiness/module gating, retry/abort/close ownership; atomic summaries/checkpoint/publication epoch and bounded verified raw/session/visitor expiry. Summary-history purge remains blocked pending policy. |
| Analytics tracking/session/head/salt | Bounded body before work; deterministic visitor conflict row; pageview/session count/touch in one transaction under tracking admission + barrier; salt single-flight/conditional write uses query lease. |
| Analytics publication invalidation at restore | Owner-only fenced schema/session repair rotates one scalar publication epoch and clears the raw-backed cursor, including rollback, before writers reopen. |
| Logging activity/error writes and delayed fingerprint flushes | `fireAndForgetDbWrite` runs under background leases; each query retains its own execution lease. Starts after fencing reject/drop through existing best-effort handling |
| Logging retention/access-file maintenance | Complete scheduler operation under background lease; manual APIs under H3 envelope |
| Deferred schema/stat/taxonomy/FTS backfills | Complete deferred operation under background lease; boot skipped entirely in recovery mode |
| Download archive cleanup | Complete cleanup under background lease; cron stopped on close |
| Backup create/import/consolidate/delete/prune | Exclusive backup-family ownership; request/background leases; backup create additionally holds media publication admission through DB export/packing and refuses incomplete object claims. Uploads acquire ownership before ingestion; delete includes all descendants and rejects cycles |
| Media cleanup and deletion retry | Conditional DB claim arbitrates source reservations; 1/4 publication serializer prevents stale disk retries touching successor uploads; finite pages/count/failure summaries and cooperative cleanup cutoff; legacy reference_safe=false refuses deletion |
| Boot media state/stage recovery | Before request admission, under private in-memory boot scope; conditional 100-ID ready migration, capped claim/inode reconciliation and receipt-owned stage sweep; unknown/corrupt evidence refuses, never broad-deletes |
| Restore/schema/credential/epoch repair, media swap/regeneration, rollback | Exact exclusive owner context after drain; file-based regeneration shares the global image queue and original month; no detached worker can publish after release |
| Public Nitro post caches / delayed SWR publication | Keys include per-process/maintenance generation; cache cleared on completion. A late old-generation result cannot become the new generation's entry |

Access-log bytes are deliberately outside DB/media snapshots. File append admission and logging migration receipts are preserved; no broad logging-storage deletion or historical runbook rewrite occurs here. Historical dumps with nonempty `access_logs` require the existing receipt-verified migration on an approved copy before automatic restore.

## Ordering and restart

Job ownership is reserved synchronously, then acquired through an atomic directory. An exact-observed-token reclamation directory serializes dead-local contenders; no lifetime/shared publication guard exists. After ownership, restore closes mutation admission, drains, and enters subsystem/DB/FS work. All job-lock acquisition is fail-fast (never queued), including a request which already holds an envelope lease; no lock inversion can wait indefinitely for a restore-owned job. Root helpers are not publicly selectable bypass flags.

Retired `.writer.lock` and `.ownership.guard` are ignored without traversal/removal. Live/PID-reused/remote job owners are not TTL-stolen; old releases cannot delete successors. Recognized dead-local file/directory jobs can reclaim after job-only quiescence. Partial/corrupt/remote ownership or interrupted reclamation can need a narrow offline job remedy, never a site-startup DB-consistency assertion. Setup's required boot probe classifies actual restore, not generic job presence; its independent monotonic receipt remains intact. Trustworthy v1 preparation is automatically aborted and bounded owned staging cleanup may run; verified terminal journals are informational. Only destructive/ambiguous restore fences required boot and ordinary traffic; legacy media swap/unmatched/contradictory evidence is preserved. No generic startup/unclean-close receipt is created.

Only exact GET health/readiness/restore-status and static Nuxt assets reach ordinary routing while closed. Fenced browser requests receive a static explanation, not SSR; unavailable readiness includes sanitized startup guidance. No blanket auth/backups/IPX exemption exists. Status requires the 24-hour, hash-persisted restore-job capability issued to the prevalidated caller; a stale cookie is not current owner authority, and a terminal capability cannot see an unrelated later job. There is no public ROOT/recovery/unfence endpoint.

## Verification and remaining gates

- Real H3: disconnected save remains leased; new auth/backups mutations reject; exact status bypasses unavailable identity/visibility DB only with its capability.
- Real owned FS/processes: concurrent acquisition, stale/partial/remote ownership, stale release, uncertainty latch, and SIGKILL/restart at nine journal phases.
- Synthetic cutover faults: preflight/drain and post-wipe failures, paired rollback, ambiguous execution and rollback failure preserve fencing/artifacts.
- Real Node 22 / SDK 2.0.3 / SurrealDB 3.2.4 worker: full/partial commit, post-media incremental rollback, historical-month variants, account epoch rotation and rotated runtime credentials.

Phase 3 separately validates real scoped DB claim arbitration, staged H3/native limits and owned inode-witness FS interruption/refusal cases. Combined media process-crash checkpoints and reviewed legacy reference reconciliation remain pending, not an automatic receipt/flag bypass.

Actual Nitro/proxy/browser/module builds, Linux hard-link/inode/directory fsync/power-loss/symlink/mount/disk-full behavior, mixed load and approved production-copy/operator acceptance remain release gates. New schedulers/extensions must use these interfaces and update this inventory before being supported.
