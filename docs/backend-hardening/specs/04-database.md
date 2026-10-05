# Spec 04: Database lifecycle, deadlines and data-preserving schema

Tasks: **REV-2.1, REV-1.6, REV-4.6**; identity schema support for REV-1.1.
Findings: F-12, F-13, F-26.

## 1. Baseline and compatibility

`db.ts` correctly shares an initial connection promise and distinguishes dedicated ROOT clients, but failed handshakes lack cleanup and Promise.race deadlines do not cancel work. Runtime credentials optionally use a DATABASE EDITOR, otherwise ROOT. Boot uses ROOT for schema/provisioning. Keep these identities separate.

The review did **not** establish exact 3.2.5 permissions for every DDL statement. Do not claim all EDITOR schema operations fail. Test the actual required statements and use privileged clients only for operations that require them.

## 2. Connection ownership and shutdown (REV-2.1)

- Every newly allocated client is owned by its constructor until fully connected/authenticated/selected. On any failure or stale-generation result, close it and clear only matching connection state.
- Close timeout must itself be bounded, with late rejections handled. If an uncancellable connect completes after caller timeout, close the late client rather than leaving it orphaned.
- Shared connection initialization/reconnect is single-flight. Add bounded exponential backoff/jitter for persistent failure; do not start a new root/runtime connection for every request during outage.
- Keepalive captures the actual probed client/generation. A failed stale probe must not close a healthy replacement. Avoid overlapping probes.
- Register Nitro close once; stop keepalive, reject waiting work, drain bounded active work and close all owned clients. Tests cover repeated lifecycle events/development reload where practical.
- Dedicated ROOT clients are never rerouted/retried through runtime credentials. Root setup failures must redact credentials from error text, including escaped literal forms where relevant.

## 3. Execution deadline and retry contract (REV-2.1)

Inventory installed SDK 2.x cancellation/deadline capabilities against SurrealDB 3.2.5 before implementing. Record the actual mechanism in progress.

- Separate connection/admission wait, response deadline and server execution deadline. Distinguish them in diagnostics without exposing raw SQL secrets.
- Use supported server-side `TIMEOUT`/transaction bounds where applicable. Do not append syntax blindly to arbitrary multi-statement SQL.
- If SDK cancellation is unavailable, document residual execution and restrict heavy work to an explicitly owned maintenance client where connection disposal is safe. Closing a shared foreground socket to cancel one request disrupts unrelated requests and is not the default solution.
- Add explicit retry classification at callsites (`readOnly`, known idempotency, or no retry). A regex on the first SQL token cannot establish that a multi-statement query is safe.
- Auth rejection is not universally proof that an entire script had no effects. Retry writes only when non-execution/rollback is established for the whole operation.
- Ambiguous write disconnect/deadline is surfaced as uncertain; an idempotency key/conditional claim or status lookup resolves it. Avoid automatic duplication of counters, CREATE, RELATE and destructive batches.
- Bound active and waiting queries independently for foreground/background work. Small independent budgets are preferred over a broad connection pool. Measure contention before adding another persistent client.

Acceptance: artificial late successful writes are not replayed; a script beginning SELECT and later writing does not inherit read retry; explicit read retry recovers; timeout/close paths have no unhandled rejections; genuine auth and network errors remain distinguishable.

## 4. Runtime privilege matrix (REV-2.1)

Exercise on 3.2.5:

| Identity | Intended operations |
|---|---|
| Runtime DATABASE user | Ordinary scoped reads/writes, validated application maintenance allowed by role |
| Dedicated privileged client | Provision runtime user, required schema/security DDL, approved wipe/import/schema repair |
| HTTP export/import client | Explicit credentials and database target; never inherited accidentally from caller input |

- Prefer configured least-privilege runtime credentials for production. If legacy ROOT fallback remains, emit one clear non-secret startup warning and document it rather than silently calling it least privilege.
- Backups/restore use explicit privileged ownership where needed; `wipeDatabase` currently calls `useDb`, so verify and correct its privilege assumptions.
- Restoring exported database users can alter the runtime user's credentials. Reprovision/verify the configured runtime account and recycle runtime connections before reopening service.
- Maintain a privileged recovery path independent of broken runtime auth, but expose no public root endpoints.

## 5. Schema and migrations (REV-1.6, REV-4.6)

- Remove unconditional media resets per spec 03 §7.
- Split routine additive schema synchronization from one-time legacy field/table removal and FTS index replacement. A changed schema hash is not authorization to destroy indexes/data on every upgrade.
- Analyzer/index migrations have named versions and completion markers. Check index readiness using supported 3.2.5 behavior; do not write a success marker merely after submitting an asynchronous build.
- Review `REMOVE FIELD word_count/cjk_char_count` and compatibility resets for actual data behavior on 3.2.5; preserve existing stats and recompute only through a bounded migration when needed.
- Backfills page by stable key with byte and row limits, checkpoint after durable work and pause through the maintenance barrier. Preserve SDK record-ID/datetime precision; do not truncate nanosecond cursors to JS milliseconds.
- Bounded writes after a full-corpus read are not a bounded backfill.
- Concurrent boot/migration ownership is explicit. The single-writer deployment can serialize all schema migration; do not rely on two processes both checking an absent marker.
- Retain legacy access migration receipts and existing crash-safe behavior. A historical backup containing `access_logs` still needs its deliberate export/removal workflow.

## 6. Query optimization evidence

Candidate work, not unconditional index prescriptions:

- Analytics lookup `(visitor_hash, last_seen_at)`.
- Error occurrence access `(fingerprint, timestamp)` and direct error-group IDs.
- Media filter/order/ownership predicates and graph relation `in`/`out` lookup.
- Current-version block/FTS candidate selection.

For each changed query store SQL shape, parameters, fixture distribution, `EXPLAIN` output, result correctness, elapsed time and DB RSS. Compare before/after. Retain known `WITH NOINDEX` workarounds until the exact correctness regression passes.

Do not use numeric `math::min/max` on datetime fields without proving valid behavior. The earlier logging work recorded invalid extrema; review analytics oldest-event and log stats paths and use an ordered/validated alternative where needed.

## 7. Acceptance

- [ ] Handshake/connect/use failures and late completion leak no owned sockets/timers.
- [ ] Shared/dedicated client identity and retry invariants pass real and mocked tests.
- [ ] Deadline behavior is documented and ambiguous writes are not duplicated.
- [ ] Routine schema updates preserve media/stats and avoid unrelated FTS rebuilds.
- [ ] Interrupted migrations resume with correct data and completion markers.
- [ ] Real SurrealDB 3.2.5 result shapes, transactions, permissions and index-order correctness are recorded.
