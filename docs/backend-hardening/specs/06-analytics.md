# Spec 06: Bounded analytics and verified retention

Tasks: **REV-4.1, REV-4.2**. Finding: F-09.

## 1. Baseline

`rollupAnalyticsDay` loads every pageview/session in a day and builds sets/maps in Node. Dashboard live totals repeat raw-event reads. Completed-day work starts from the oldest retained raw event on each run. Page/geo summaries are deleted then recreated one row at a time, without a publication boundary. Retention deletes raw tables in unbounded statements.

`findOldestPageviewDate` also uses a datetime `math::min` shape that earlier logging work found invalid on 3.2.x; verify it on 3.2.5 instead of assuming it works. An invalid oldest-date result must not skip rollups and then allow retention to delete unaggregated data.

## 2. Required semantics (REV-4.1)

Preserve response fields, UTC day boundaries, visitor hashing/privacy, staff/bot exclusion, and the existing explicit approximation flag for summing daily unique counts across days.

Define and test:

- Page views per UTC day, normalized path and geo tuple.
- Unique visitors within a day; cross-day sums are not exact cross-day distinct users.
- Session assignment based on inactivity window, session count on its start day, bounce from final page count and nonnegative duration.
- Cross-midnight sessions and late-arriving updates to yesterday's session summary.
- View-count increment semantics when analytics collection is disabled but a published post is tracked.

Avoid inventing non-idempotent counters during retries. Simultaneous events for one visitor must not create unintended duplicate active sessions or move `last_seen_at` backwards. Document whether a pageview/session update is transactional and how partial failures are reconciled.

## 3. Bounded aggregate/read design (REV-4.1)

Use database scalar/group aggregates for counts/sums rather than raw row arrays. Exact distinct is a deliberate design decision:

- Prefer a tested DB-side exact aggregate only if DB memory remains acceptable at measured cardinality.
- Otherwise use persisted daily visitor keys / bounded staged reduction with unique keys and pagination. Account for extra write amplification and retention.
- Do not claim an in-memory Set is bounded merely because input arrives in pages. Do not silently replace exact daily counts with an approximate sketch without a coordinated API/product decision.

Top-pages/geo results are bounded. Grouping on arbitrary paths can itself be huge, so canonicalize and cap path/referrer input, define maximum result cardinality and an explicit `other`/truncated policy where needed. Avoid unbounded Node maps merging all grouped rows across dates. Use DB aggregation or staged bounded merge.

Live dashboard queries return scalars/small grouped pages, not every visitor hash/session. Validate finite ordered date windows and maximum range. Count/aggregate queries still need server deadlines and `EXPLAIN`/RSS verification.

Candidate session index: `(visitor_hash, last_seen_at)`; verify actual filter/order plan and correctness on 3.2.5. Use bounded/atomic active-session coordination; do not rely on SELECT-then-CREATE alone under concurrent events.

## 4. Query and data contracts (REV-4.1)

- Date parameters bind supported SDK datetimes; cursor persistence preserves source precision when needed.
- Invalid `inf`, null or malformed extrema are a failure to establish a boundary, not a valid empty dataset.
- Frontend callers continue receiving finite numbers and explicit approximate/partial metadata if applicable.
- Tracking rate limiter is atomic and input/body processing is bounded before DB work. Hash salt initialization is single-flight/atomic so first concurrent events cannot choose different salts.
- Every analytics mutation uses the maintenance lease, including post view increments and session touches.

## 5. Summary publication and checkpointing (REV-4.2)

Use a durable per-day publication state, with either a tested bounded transaction or generation-based shadow summaries:

1. Claim day/generation with a lease and capture source boundary.
2. Compute bounded scalar/group data and stage summary rows in batches.
3. Verify completeness/counts.
4. Atomically publish the generation and mark day complete.
5. Readers use only published generations; old summaries are removed later in bounded batches.

Deleting all visible summaries before creating replacements is forbidden. Markers and summaries cannot disagree after a crash.

A durable watermark avoids recomputing all retained days on each run. Keep a documented repair window sized for allowed late arrivals and cross-midnight session changes (initially at least the maximum configured session window plus day boundary margin). Events older than the window follow an explicit repair/reject policy; they are not silently lost. A successful second pass skips immutable completed history while still repairing eligible recent days.

The scheduler has startup/settings/module readiness, single-flight execution, bounded retries/backoff and a Nitro close hook. An hourly retry should not restart an entire uncheckpointed historical scan.

## 6. Retention (REV-4.2)

- Freeze cutoff at run start. Delete only eligible raw data whose required summaries are verified published, outside the repair window.
- Pageview cutoff and session eligibility differ: sessions must be closed/idle and their start-day metrics finalized. Recent `last_seen_at` cannot be deleted because `started_at` is old.
- Select bounded IDs and `DELETE ... RETURN NONE`; return only scalar counts. Apply row/byte/batch/time limits, cooperative pauses and `retryOnReconnect:false` or equivalent explicit no-retry behavior.
- Each stream reports completed/incomplete/error and checkpoint. Reaching a limit does not advance a watermark past unfinished work.
- Bound retention for staging generations, distinct-key tables and summaries too; do not move unbounded growth to new tables.
- Disable/enable analytics/module behavior is explicit: preserve existing data unless retention policy authorizes its deletion.

## 7. Tests and acceptance

- [ ] Small exact fixture independently verifies daily totals, geo/path grouping, bounces/durations, unique visitors and cross-day approximation flag.
- [ ] Concurrent same-visitor events and out-of-order timestamps produce defined session behavior.
- [ ] Raw rows grow 10x without proportional Node heap; DB memory and query latency are also measured.
- [ ] High-cardinality paths/visitors/geo and long ranges respect budgets and disclose any approximation/truncation.
- [ ] Partial/failed generation is invisible; old complete summaries remain readable until new publication.
- [ ] Crash/resume does not double count or delete unpublished raw events.
- [ ] Repeated daily runs skip immutable history; late-arrival/cross-midnight repairs are correct.
- [ ] Chunked retention preserves exact cutoff/tie and active-session boundaries and reports incomplete work.
- [ ] Real 3.2.5 datetime/aggregate/index result shapes and isolated memory measurements are recorded.
