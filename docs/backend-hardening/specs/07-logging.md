# Spec 07: Extend logging bounds without regressing the redesign

Tasks: **REV-4.3, REV-4.4**. Findings: F-20, F-21, F-22.

**Access-specific requirements superseded:** [access-log retirement](../../access-log-simplification/plan.md) removes the writer/reader/cache/export/purge/migration, rather than completing REV-4.3's query platform. Sections 1–3 and access-file bullets below describe the historical feature, not instructions to retain or reactivate it. Preserve existing history externally/inertly; see [current logging operations](../../logging/operations.md). Global error/activity admission and truthful DB deletion requirements remain outstanding; their gates are not waived.

## 1. Relationship to docs/logging

Read [logging architecture](../../logging/specs/00-architecture.md), [file-store spec](../../logging/specs/05-access-log-files.md), [error groups](../../logging/specs/06-error-groups.md), and [progress decisions](../../logging/progress.md).

Keep:

- UTC NDJSON/gzip access storage and 8 MiB write/replay guards.
- Plain-source preference during gzip recovery, symlink protection, descriptor closure and migration safety receipts.
- Existing CSV formula protection/redaction, 10K export ceiling, exact route wrappers and superadmin gates.
- Grouped error lifetime counts separate from retained occurrence samples.
- Bounded `DELETE ... RETURN NONE`, no reconnect retry for destructive work, strict tied-timestamp safety and known NOINDEX workarounds.

This work adds byte/concurrency/execution bounds. It does not return access logs to SurrealDB or claim the existing purge loads all history into memory.

## 2. Access reader memory contract (REV-4.3)

Current newest queries keep 200K complete matching rows per day regardless of page size. Replace with a retained-window budget:

- Retain only the newest `offset + limit` candidates required for the requested result, subject to a finite offset cap, record cap and **encoded-byte cap** (initial target 8 MiB per reader).
- Release previous-file buffers as soon as their contribution is resolved. Bound total concurrent scans; per-request bounds multiply under parallel polling.
- Count metadata/row object overhead in RSS measurements. Byte accounting on strings is an admission estimate, not exact V8 heap accounting.
- Parse lines with a bounded decoder. Reject/skip and report an oversized legacy line while draining to the next delimiter; readline buffering an unbounded line before rejection is not safe.
- New writes apply a finite whole-line cap (initial target 64 KiB, including newline) while retaining valid JSON and required fields. Truncate optional context/UA/referrer safely or drop with diagnostics.
- Preserve current newest/oldest ordering assumption and explicit `truncated` lower-bound semantics. If a deadline stops before the newest end of a day, do not present the scanned prefix as a complete newest page.
- Exports remain bounded, backpressured and abortable; cancellation frees reader descriptors and buffers.

## 3. Budget every scan and make statistics incremental (REV-4.3)

List, detail, hourly and stats get duration/line/byte budgets plus cancellation. Filesystem enumeration has a finite retention-derived bound or streaming directory iteration.

- Detail timeout/incomplete scan is an explicit unavailable/truncated result (e.g. 503), not a definitive 404.
- Hourly partial results are either flagged with a coordinated additive API change or rejected as unavailable; never silently return exact-looking undercounts.
- Cache active-file line-count progress using verified file identity and byte offset, retaining incomplete trailing-line state. Append-only growth reads the suffix; replacement/truncate/inode change invalidates safely.
- Stats counts preserve documented physical-line semantics rather than suddenly becoming valid-row counts. Store cache version/identity/boundary metadata atomically. Cache is disposable and must not be confused with `.migration-v1.json`.
- Concurrent scans share bounded single-flight work where safe; cache keys include query/identity/mount generation. Avoid retaining request events or huge file maps globally.
- Cached missing/stale stats are not exact zero. Add completeness/as-of information if needed and coordinate UI/DTO/tests.
- Purge should not block deletion behind an unlimited history count. Use an already verified count or return explicit count-known/unknown plus file counts; do not label physical file count as row count.

## 4. Global DB write admission (REV-4.4)

Per-fingerprint 20/10s suppression is not a global cap. `pendingErrorSamples`, fingerprint maps, per-fingerprint serialization chains and fire-and-forget activity tasks all need bounded lifetime/cardinality.

- Bound pending serialized bytes, entries, active DB writes and distinct fingerprint keys. Initial target: 8 MiB / 2,000 entries, with separately measured small active-write concurrency.
- Retain coalescing of same-error counts, but cap sample sizes and key count before retaining them. Do not traverse/clone arbitrarily large metadata before applying its budget; use bounded serialization depth/entries/string length.
- Define overflow: error counts can coalesce/drop with counters; activity is currently best-effort and must expose drops. If durable audit is required, design a bounded disk spool explicitly rather than an unbounded memory fallback.
- Warnings are rate-limited, console-only and nonrecursive. DB outage cannot produce a fresh DB-log task for every queue failure.
- Queue work acquires the maintenance lease. During restore, settle/drop/coalesce according to policy rather than writing into partially restored tables.
- Shutdown drains within a finite deadline, reports remaining best-effort loss, clears timers/key maps, and handles late promise rejections.

## 5. Destructive controls and execution reports (REV-4.4)

Unify mutual exclusion for manual cleanup, manual purge, cron/deferred retention and error-group deletion where they overlap. Existing `runLogRetention` single-flight does not cover every direct helper caller.

Use an internal report such as:

```ts
interface DeletionProgress {
  deleted: number
  completed: boolean
  stopReason?: 'batch-limit' | 'deadline' | 'aborted' | 'error'
  cutoff: string
  // Optional cursor/checkpoint and bounded error sample.
}
```

- Freeze a start boundary; ongoing writes must not make purge chase new rows forever. Preserve post-start arrivals by contract. When timestamp precision/backdated writes complicate the boundary, choose a tested record/cutoff/claim strategy and document it.
- Age/keep-latest/cap work retains tie and refreshed-group safety. Selecting IDs then deleting them should report actual committed behavior, not a stale count snapshot.
- Loops have elapsed/batch limits, including error-group occurrence trimming and expiry loops. Reaching a cap exposes incomplete status and a resumable checkpoint.
- Keep authorization/token confirmation semantics and compatibility of numeric fields where possible; add completion/count-known fields and update consumers that currently show an unconditional success toast.
- File purge/maintenance remains serialized with migration/write mutation. Do not remove migration receipts or unknown/symlink files.
- `analytics-rollup`, `download-cleanup`, and logging scheduled tasks register stop/destroy/clear handlers. Log retention already demonstrates most of this lifecycle pattern.

## 6. Tests and acceptance

- [ ] Large encoded records and an unterminated huge line cannot bypass reader/writer byte budgets.
- [ ] Small page request retains a small window, not 200K records; offset/byte cap semantics and newest ordering are tested.
- [ ] Detail/hourly/stats cancellation closes all plain/gzip descriptors and never reports false exact absence/totals.
- [ ] Active append statistics read suffixes; truncate/replace/compression/restart invalidate safely; migration receipt untouched.
- [ ] Thousands of distinct errors and activity writes against slow/down DB obey global limits; diagnostics do not recurse.
- [ ] Trailing suppressed counts, lifetime group counts, read/regressed state and existing redaction/console behavior still pass.
- [ ] Concurrent manual/scheduled deletion and new writes preserve frozen-cutoff semantics; incomplete work is reported honestly.
- [ ] Linux file identity/symlink/fsync and real 3.2.5 delete/count/ordering tests pass.
