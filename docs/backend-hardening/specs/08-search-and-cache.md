# Spec 08: Graph/search read models, cache bounds and runtime consistency

Tasks: **REV-4.5, REV-4.6, REV-4.7**. Findings: F-23, F-25, F-26, F-27.

## 1. Scope

Preserve published/private/password post policies, current-version content semantics, CJK/Latin search and existing graph UX within explicit budgets. Vue changes are only for response compatibility, privacy and SSR fetch verification.

## 2. Graph overview and expansion (REV-4.5)

`graph/overview.get.ts` currently fetches all visible posts plus complete taxonomy/relation tables, then forms pairwise co-occurrences in Node. Do not simply cache an unbounded result and call it bounded.

- Apply current-user visibility in the DB before retrieving related edges/nodes. Private unrelated edges must not travel to Node for filtering.
- Prefer bounded DB aggregates/materialized overview data; cap expanded nodes/edges and per-post taxonomy degree/co-occurrence work. Specify an explicit truncation or expansion contract rather than silently dropping arbitrary graph edges.
- Normalize GraphPost fields with a permission-complete source. Never reuse a private overview for anonymous clients.
- Cache by finite canonical scope: anonymous published-public, owner/superadmin, or actual authenticated owner identity plus content/privacy generation. Generic `user` scope is insufficient for owner-visible private posts.
- Add TTL, maximum entries/bytes, admission and single-flight. Role/epoch/site visibility/post/taxonomy/link mutations invalidate or bump the relevant generation.
- Public endpoint rate limiting uses spec 01. Bound cache-miss storms and unique scope/key churn.
- Replace spread `Math.max(...allWeights)` with bounded iteration/reduction to avoid argument-count overflow at large taxonomy cardinality.
- Expansion uses indexed `in`/`out` relations/record arrays with finite inputs; avoid generating enormous OR clauses from arbitrary ID iterables.

Acceptance: anonymous/owner/admin/superadmin matrices; relation query plans and transferred-row counts; high-degree taxonomy; no-taxonomy fallback; concurrent identical cache misses; private-to-public/public-to-private mutations; expired/revoked sessions; finite node/edge response size.

## 3. FTS lifecycle and corpus rebuild (REV-4.6)

### Preserve search semantics

The current analyzer uses `blank,class` tokenizers, lowercase and `ngram(1,15)`. Its comment explains indexing/query-stage behavior. Treat reducing max length, changing tokenization or removing highlights as a search semantics migration, not an obvious optimization.

Build a fixture matrix for Simplified/Traditional Chinese, Japanese, Latin mixed text, punctuation, 1/2/3+ character terms, long tokens (>15), phrase queries, fuzzy substitutions, private/password/draft/archive states and shared/current/historical blocks.

Current FTS candidate limits apply before final visibility/owner/current-version filtering in parts of `postSearch`. Verify that historical/unauthorized hits cannot fill the limit and hide all valid current public hits; establish a bounded oversampling/filter-in-query policy and disclose truncated search if needed. Keep existing safe snippet generation.

### Data/index lifecycle

- Move one-time index removal/field resets out of every routine schema hash pass (spec 04).
- Capture 3.2.5 query plans and measured index size/build time/write cost for representative CJK distribution before changing analyzer/indexes.
- Rebuild search terms/block text/stats/version-edge repairs with stable keyset pages and row/byte limits. Loading all text first then batching writes is prohibited.
- Avoid a vocabulary map/source array that grows with the whole corpus. Use persisted generation contributions, per-source bounded diffs, or a staged table with bounded reduction.
- A rebuild must coordinate with concurrent edits: either hold a bounded/approved maintenance window or capture a source generation/high-watermark and replay changes before publication. Naive load-then-clear-then-write can erase concurrent updates.
- Publish complete generations/checkpoints atomically. Interrupted rebuild must not double term df counts or expose partially rebuilt vocabulary as complete.
- Preserve marker semantics, SDK compound record IDs and datetime precision; no unbounded array spread/Promise.all over the corpus.

Acceptance: identical expected CJK results on the fixture matrix; old-version crowding regression; restart at every batch/publication point; concurrent post edit/delete; unrelated schema edit causes no FTS rebuild; large text/block count obeys Node/DB memory budgets.

## 4. Public caches and privacy transitions (REV-4.7)

The review identified full-cookie `varies` and potential cache fragmentation, not a measured SSR memory leak. Inspect the actual Nitro storage implementation/version before asserting TTL eviction or backing-store behavior.

- Public API/SSR cache keys consist only of canonical bounded public parameters and content/theme/locale generation actually affecting the response.
- Authenticated sessions, pending-auth where relevant, unlocked posts and private-site responses bypass public response caching. The `/` routeRule must obey the same rule; setting a response header alone is not proof that Nitro's handler cache is bypassed.
- Unknown/unrelated cookies cannot generate unbounded entries. Known locale/theme variants are finite and included only when they actually affect rendering.
- Limits include maximum keys/bytes and real expiry/eviction. TTL freshness checks are not necessarily key deletion in the installed backend.
- Visibility lookup failures fail closed or retain a verified last-known restrictive state. `loadSiteVisibility()` currently catches failures as `public`; do not turn a private site public during DB trouble.
- Site/post visibility, password policy, content and theme changes invalidate affected caches. Restore bumps/invalidate all relevant cache generations after verified import.
- Origin/shared-cache headers match the server cache policy; `Vary` alone is not an authorization mechanism.
- Measure SSR subrequests before/after on one page to ensure new identity/cache work does not introduce duplicate data fetching. Use request-local memoization/shared Nuxt payload paths, not globally cached H3 events or per-user mutable state.

Acceptance: two browsers with different auth/owner/unlock states; random cookie/key churn; theme/locale variants; public-to-private transition; DB outage during private visibility read; restore and logout/revocation. Assert no personalized HTML/API result reaches another client and cache memory/key count remains bounded.

## 5. Runtime/input consistency (REV-4.7)

- Replace trust in generic TypeScript `readBody<T>` with actual schemas on affected routes. Bound total body/strings/arrays before expensive work; handle null/primitives/arrays and nonfinite query values as 4xx.
- Use runtime configuration for deployed overrides and document plain versus `NUXT_` env names. Do not print or rewrite local `.env`. Review build-time `.env` precedence versus runtime overrides with synthetic configs.
- Align Node typings/engines/CI with supported Node 22 APIs; retain actual package ESM export compatibility (Archiver fix is REV-1.5).
- All plugin intervals/timeouts/cron tasks are owned and stopped on Nitro close; error hooks/handlers are registered once. No event listeners retain per-request bodies after response completion.
- Preserve supported reverse-proxy deployment and overwrite-XFF guidance. Directly trusting forwarded headers is only safe if direct app access is prevented or trusted-peer validation is implemented.
- Avoid broad catch-to-empty behavior in authorization, restore verification and request parsing. Distinguish missing data, invalid input and unavailable dependencies.

## 6. Acceptance

- [ ] Graph/search results remain authorized and semantically compatible within documented limits.
- [ ] Rebuild/index changes are resumable, bounded and measured on 3.2.5.
- [ ] Cache cardinality and privacy behavior pass real Nitro/proxy tests, not only helper tests.
- [ ] Node 22 builds/typechecks/tests, optional modules and SSR smoke pass.
- [ ] Any response-contract change has coordinated minimal UI updates and both translations.
