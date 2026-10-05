# Spec 00: Backend hardening architecture

Applies to **every REV task**. Status: **proposed target; application unchanged**.

## 1. Scope and source of truth

- Focus: Nitro handlers/plugins and SurrealDB integration, resource-heavy maintenance, security and media storage.
- Target: Nuxt 4, supported Node 22 minor, stable SurrealDB **3.2.x**, installed `surrealdb` SDK, nuxt-auth-utils, Sharp. User-authorized amendment on 2026-10-05: the reproducible fixture/CI pin is **3.2.4**; record the exact version/build in each run. This supersedes original 3.2.5 requirements elsewhere in this package, not the need for real changed-SQL acceptance. Historical evidence is unchanged.
- Frontend work is limited to coordinated API changes, security behavior, translations, and SSR cache/fetch correctness. No component/styling redesign.
- [Findings](../findings.md) separates source-confirmed defects, local reproductions and live-validation hypotheses. [Progress](../progress.md) is the only task-status ledger.
- Read the relevant implementation, not only the original review. Preserve the [logging redesign](../../logging/progress.md) decisions: file-backed access logs, bounded deletion, dedicated ROOT identity, module flags, receipt-verified legacy migration, and known datetime/index workarounds.

## 2. Required invariants

1. **Authorization uses current server state.** Cookie integrity is not revocation. Missing/disabled accounts and revoked epochs cannot authorize any route, including optional-auth public handlers.
2. **Restricted data never enters a public cache.** Projection omission must not change a private record into a public one.
3. **All potentially growing work has finite admission and retention.** Bound active jobs, waiting jobs, queued bytes, per-record bytes, cardinality and lifetime; row counts alone are insufficient.
4. **Streams remain streams end to end.** A stream argument followed by `Buffer.concat`, `readFile`, `response.text()` or whole-document JSON parsing is not a bounded pipeline.
5. **Caller timeout and execution cancellation are different contracts.** A late write must not be replayed as though it definitely failed.
6. **Destructive work is fenced and recoverable.** No automatic data deletion on a missing marker. Wipe/import/swap cannot race foreground saves, logging, analytics or backfills.
7. **Partial completion is visible.** Timed-out scans, batch-capped purges and failed rollback are not exact counts, empty results or success.
8. **Restore artifacts are sensitive executable inputs.** Staging a SurQL dump is validation, not a security sandbox. Do not claim ROOT import safely accepts hostile SQL.

## 3. Target flow

```text
request -> bounded body/query parsing -> current identity + role/owner policy
        -> mutation lease when writing -> subsystem admission -> bounded DB/FS work

background task -> same mutation lease + subsystem admission -> checkpointed work

restore -> exclusive owner + durable journal
        -> close mutation admission -> drain/pause writers
        -> validate staged SQL/media + safety snapshots
        -> wipe/import/schema/credentials/media swap -> verify
        -> reopen only after consistency is proven

failure after destructive phase -> rollback or remain fenced + operator recovery
```

The initial supported deployment remains **one Nitro process / one app writer** with persistent local storage and an external DB. Do not introduce Redis, a distributed queue or a broad connection pool as an incidental fix. If multi-worker correctness cannot be provided, enforce/document single-writer startup rather than claiming cross-host safety.

## 4. Resource contracts

Implementation must expose test-injectable limits and record production defaults in operations. These are initial **design budgets**, not measured deployment claims:

| Resource | Initial target | Notes |
|---|---|---|
| Active image jobs | 1 per app process | Includes pHash and regeneration; Sharp thread limit remains separate |
| Waiting image jobs | At most 4 admitted jobs | Do not retain upload bodies while waiting; disk staging has its own quota |
| Active Argon2 operations | 2 per process | 64 MiB configured cost each; measure native RSS and libuv behavior |
| Waiting KDF operations | At most 16 | Short bounded wait then 429/503 as appropriate; no unbounded promise queue |
| Backup/restore/consolidation jobs | 1 heavy backup-family job | Streamed downloads of ready immutable artifacts need separate lightweight admission |
| Access-reader retained payload | At most 8 MiB per scan | Plus finite parser/row overhead; budget concurrent scans too |
| Access-record encoded size | At most 64 KiB including newline | Legacy oversized records safely skip/report; cannot accumulate an unbounded line before checking |
| DB logging pending payload | At most 8 MiB and 2,000 entries | Bound active writes and fingerprint keys separately; coalescing/drop is explicit |
| Ordinary DB maintenance batch | Up to 1,000–2,000 small rows | A second serialized-byte cap is required for content/blob-like fields |
| Query/time/scan/cache limits | Finite and task-specific | Validate nonfinite/negative config; caches need maximum entries/bytes, not TTL alone |

Agents may adjust these defaults using measured evidence; record why, peak RSS and workload. Do not substitute a larger Node heap limit for bounded algorithms. Measure `rss`, `heapUsed`, `external`, `arrayBuffers`, DB RSS and disk, because Sharp/Argon2/Buffers are not fully represented by heap usage.

## 5. Cross-cutting interfaces and migration rules

- One reusable admission primitive may serve multiple subsystems, but independent budgets are required. It supports abortable acquisition, finite waiters, release in `finally`, drain and shutdown. Do not keep a global map of per-key locks forever.
- Request-local identity memoization is allowed; cross-request positive authorization caching is not the initial design. If added later, document the revocation window and invalidation guarantee.
- Mutations and background jobs use a shared lease/barrier interface. Restore uses an explicit owner-scoped privileged context, not a public boolean that arbitrary callers can set.
- SurrealQL binds values; interpolated identifiers come from strict allowlists. Mutation retries require idempotency or explicit confirmed rollback.
- Multi-statement text beginning with `SELECT` is not proof of read-only behavior.
- New schema is module-filtered and data-preserving. Large backfills are checkpointed, bounded and fenced; marker writes occur only after verification.
- New config follows types, defaults, runtime parsing, validation, persistence if applicable, UI/reset behavior if exposed, tests, both translations, and documentation. Operational budgets need not all become admin settings.
- HTTP output uses explicit DTOs. Authorization requirements must be expressible in types; missing privacy/ownership fields should fail closed rather than use a public default.

## 6. Non-goals and guardrails

- No production browsing of secrets, full database exports or destructive tests. `.env` is not a test-fixture configuration source.
- No rewriting old logging progress as if these later improvements were already implemented.
- Do not remove `WITH NOINDEX` just because an index exists. Earlier 3.2.4 testing found ordering defects; retest the exact query shape on the chosen 3.2.x build.
- Do not reduce CJK ngram maximum blindly or silently change search recall.
- Do not promise atomic database-plus-filesystem transactions; use a journal/state machine with observable intermediate states and idempotent recovery.
- Do not silently drop raw analytics or audit data to meet a benchmark. Define retention and degradation explicitly.

## 7. Acceptance

- [ ] Every growing collection/queue introduced by these tasks has count/byte/lifetime limits where applicable.
- [ ] Security and destructive-operation decisions fail closed with useful non-secret diagnostics.
- [ ] Schema/API/deployment compatibility changes have migration and rollback notes.
- [ ] Each task has regression evidence and updates progress; no local result is represented as production approval.
