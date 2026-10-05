# Backend review: findings and baseline evidence

This is the stable finding register for the [implementation plan](./plan.md). **Nothing in this register is fixed merely because the plan/specs exist.** Record task completion in [progress](./progress.md); add a test/evidence reference here when resolving or disproving a finding.

## Baseline identity and limits

- Repository: PandaBlog, branch `main`.
- Baseline source revision: `067fb64f5654e45668b29bcaaf7346eb12576c0a` (captured during handoff preparation, 2026-10-05 UTC).
- Review focus: `server/`, database/schema, backend-related Nuxt/deployment configuration. No general Vue/style review.
- User-specified target: Node 22, Nuxt 4, SurrealDB 3.2.5.
- Review execution environment: **Node v24.15.0** on Windows/Git Bash; installed Vitest 4.1.6. Review commands did not exercise a live DB.
- Pre-existing untracked `pandablog-latest.tar.gz` was not inspected, changed or used as a fixture. `.env` contents and existing application storage were not read as test inputs.
- Current code should be rechecked before each task. Historical line references below are intentionally replaced by file/function names to survive refactoring.

### Severity / confidence

**High**: authorization/privacy/data-loss defect or serious resource risk reachable in a normal backend workflow. **Medium**: bounded-but-excessive work, compatibility/correctness issue, or operational hazard with additional conditions. This is prioritization, not a CVSS assessment.

**Source**: confirmed control/data flow from code, without an end-to-end exploit/load claim. **Reproduced**: local behavior demonstrated; the scope of the reproduction is stated. **Validate**: additional concern/optimization whose exact impact needs installed-runtime/3.2.5 evidence. All statuses initially remain **open**.

## Finding register

| ID | Priority / evidence | Finding and trigger | Primary files/functions | Tasks |
|---|---|---|---|---|
| F-01 | High / Source | Sealed cookie role/identity remains authoritative after account disable/delete/demotion/password changes; no server-checked epoch/version. | `server/utils/auth.ts`: getSessionUser/requireUser; `users.ts`: updateUser/setUserPasswordHash/deleteUser; auth change-password | REV-1.1 |
| F-02 | High / Source | Disabling multi-user mode promotes every valid session to superadmin instead of requiring the designated owner. | `auth.ts`: effectiveUserForModuleMode/isAdminTier/isAdminAuthenticated | REV-1.1 |
| F-03 | High / Source | Private original/variant responses carry public immutable one-year headers; ZIP projection omits privacy/owner fields and normalization defaults to public. ZIP flaw is latent behind F-14's current runtime failure. | `mediaServe.ts`: serveOriginalMedia/serveMediaVariant; `api/media/download.post.ts`; `mediaPermissions.ts`; `mediaLibrary.ts` normalization | REV-1.5 |
| F-04 | High / Reproduced classifier, Source transport | Hex-form mapped IPv6 loopback/metadata and parts of link-local IPv6 pass guards; webhook performs a fresh unpinned lookup after validation. No internal service was contacted. | `net/private-ip.ts`; duplicate importer guard; `notify/security-alert.ts` | REV-1.4 |
| F-05 | High / Reproduced fake-store race, Source login flow | Concurrent get/set counters lose increments; login records only after expensive verification. One-request fake-store limit admitted twenty concurrent requests. | `rate-limit.ts`: consumeRateLimit/checkLoginRateLimit/recordLoginAttempt; login/unlock callers | REV-1.3 |
| F-06 | High / Reproduced real fs driver | Unstorage fs ignores ttl; public endpoint/unknown unlock keys persist indefinitely without sweeping. | `rate-limit.ts`; `nuxt.config.ts` fs mount; installed unstorage driver | REV-1.3 |
| F-07 | High / Source | Restore/validation/import/safety snapshots and consolidated downloads buffer multiple full SQL copies; sync gzip/gunzip blocks Nitro. Compressed cap is not expanded cap. | `backups/{surrealHttp,restore,validate}.ts`; consolidated DB download handler | REV-2.3, REV-2.4 |
| F-08 | High / Source | Multipart bodies are buffered before media size/count checks; Sharp concurrency(1) is not cross-request job admission; no application-specific pixel budget. | media/admin uploads; `imageProcessor.ts`; `imageHash.ts`; `plugins/sharp-config.ts` | REV-3.1 |
| F-09 | High / Source; datetime/index impact Validate | Analytics materializes raw daily events, repeats retained-day work, exposes delete/recreate summary gaps and uses unbounded retention. Oldest datetime math::min needs 3.2.5 validation. | `analytics/{rollup,read,session}.ts`; analytics plugin/track endpoint | REV-4.1, REV-4.2 |
| F-10 | High / Source | Media search pages after full-table load; pHash and selected-hash orphan cleanup load broad datasets; cleanup retains all deleted records and unlinks before unconditional DB deletion. | `mediaLibrary.ts`: mediaSearchFileRecords/mediaFindSimilarImage; `mediaCleanup.ts` | REV-3.2, REV-3.3 |
| F-11 | High / Source; concurrency/crash integration pending | Restore does not drain existing/background writers, allows broad auth mutations, releases while rebuilds run; stale/unreadable lock recovery uses nonexclusive overwrite. | restore maintenance middleware; `backups/jobMutex.ts`; restore worker and plugins | REV-2.2, REV-2.4 |
| F-12 | High / Source | Missing/different media storage marker triggers unconditional DELETE FROM files and settings reset at boot. | `plugins/db-init.ts`: ensureMediaStorageVersion | REV-1.6 |
| F-13 | Medium / Source | Promise.race deadlines do not cancel DB work; failed connection/signin/use lacks owned-client cleanup; no shared-client close hook; first-token retry classification is insufficient. Exact SDK cancellation and permissions need validation. | `utils/db.ts`; privileged backup callers | REV-2.1 |
| F-14 | Medium / Reproduced installed runtime | Archiver 8 require returns namespace, not factory; calling archiver('zip') throws TypeError. ZIP stream error/cleanup lifecycle also needs repair. | `api/media/download.post.ts`; installed `archiver/index.js`; package/types | REV-1.5 |
| F-15 | Medium / Source | No accepted TOTP timestep is recorded; recovery-code read/filter/write allows concurrent reuse/lost removal; activation does not check active account. | MFA totp/store/session; login/mfa and admin MFA activate | REV-1.2 |
| F-16 | Medium / Source | Restore regeneration defaults to current date/month and discards generated variants metadata; stored historical paths no longer resolve after cache clear. | `backups/restore.ts`: regenerateVariantsBackground; imageProcessor/fileStorage | REV-2.4, REV-3.3 |
| F-17 | Medium / Source; browser integration pending | Blanket auth mutation origin exemption permits login-CSRF/same-site sibling-origin concerns despite SameSite=Lax. | `middleware/api-origin.ts`; auth POST/PUT handlers | REV-1.2 |
| F-18 | Medium / Source | Syntax/length validation does not prevent expensive user regex backtracking; media matching actually runs in Node despite route comment. | media search endpoint; `mediaLibrary.ts`: compileRegex/mediaTextMatches | REV-3.2 |
| F-19 | High / Source; race regression pending | Concurrent same-hash uploads can both write shared paths; losing database CREATE cleans up successful request's originals/variants. | `mediaLibrary.ts`: mediaCreateOrReuseFileRecord; fileStorage | REV-3.3 |
| F-20 | Medium / Source | Access newest scan retains up to 200K full records, not byte-bounded; detail/hourly/stats lack scan deadlines; active plain stats repeatedly scan and purge counts first. This is not a claim that all log history is buffered. | access-log-reader/store; logging-admin/stats | REV-4.3 |
| F-21 | Medium / Source | Per-fingerprint suppression does not bound global error/activity tasks, key cardinality or pending bytes during stalled DB/many distinct errors. | logging.ts/logging-logic/error-group-write and backpressure paths | REV-4.4 |
| F-22 | Medium / Source | Scheduled single-flight does not cover every manual helper; reaching batch limits can return only a count without incompleteness; group loops and count-before-purge work need finite deadlines/frozen boundary. | log-retention/error-groups/logging cleanup/purge APIs | REV-4.4 |
| F-23 | Medium / Source | Public graph overview loads full relation tables and aggregates in Node; taxonomy pair formation and uncached requests have no explicit graph work budget. | `api/graph/overview.get.ts`; graphQuery and expansion endpoints | REV-4.5 |
| F-24 | Medium / Validate + historical reproduced subcase | Verify partial-table replacement (not additive resurrection), archive entry types/expansion, duplicate import parts and staged failure cleanup. Prior logging progress records actual empty-media tar.c([], ...) failure; no new backup integration performed in this review. | backup validate/registry/tarStream/import route/restore | REV-2.4 |
| F-25 | Medium / Source; additional regression pending | Setup uses check-then-write with overwrite branch; auth inputs rely on TypeScript types; MFA key derivation calls scryptSync per operation; setup/visibility dependency errors can fail open in related paths. | auth setup/settings; auth bodies; mfa/secret-crypto; visibility | REV-1.2, REV-4.7 |
| F-26 | Medium / Source; query optimization Validate | Any schema hash change can remove/recreate FTS indexes; corpus backfills load all block/text/source maps before batched writes. Candidate filtering before visibility/current-version resolution may harm recall. Index/analyzer alternatives require measurement. | schema.surql/schema.ts/db-init; searchTerms/postSearch | REV-4.6 |
| F-27 | Medium / Validate + Source lifecycle | Whole-cookie public cache variation may cause unbounded fragmentation depending on Nitro store; root HTML route/cache bypass and privacy invalidation need real tests. Some cron/interval teardown missing; Node 25 typings do not establish Node 22 support. | public-cache helpers/handlers; visibility; nuxt.config; analytics/download plugins; package.json | REV-4.7 |

## Local correction evidence (not production acceptance)

- **F-15/F-17 · REV-1.2:** corrected locally. `mfa-claims.test.ts`, `mfa-recent-auth.test.ts`, `auth-origin.test.ts`, `setup-authority.test.ts`, `setup-maintenance-blocker.test.ts`, guarded `tests/integration/setup.test.ts` and the extended current-identity SQL suite prove one-use recovery/TOTP claims, drift monotonicity, epoch/time/current/recent actor checks, compatible bounded async crypto, exclusive durable bootstrap/atomic owner creation and exact H3 origin/input policy. Actual stable 3.2.4 + SDK 2.0.3 concurrency/transactions pass on Node 22.22.0. Browser/deployment/Linux/general restore-journal gates remain pending.
- **F-25 · partial REV-1.2 correction:** setup race/DB-failure/input/MFA synchronous-key concerns corrected by the above tests; visibility/cache fail-open concerns remain **open for REV-4.7**. The setup-only permanent receipt does not close general maintenance F-11.
- **F-03/F-14 · REV-1.5:** corrected locally together. `media-privacy.test.ts`, `media-privacy-http.test.ts`, `media-archives.test.ts`, scheduler regressions and guarded `tests/integration/media-privacy.test.ts` prove missing-policy denial, no-store shared-cache/H3 privacy, private selection/known ZIP owner+epoch+current-policy authorization, actual two-file Archiver 8 ZIP round trip and fault/abort/expiry/admission cleanup. Both application projection SQL shapes pass Node 22.22.0 / SDK 2.0.3 / DB 3.2.4+20260803.93ab219. Old CDN bytes/legacy artifacts and deployed Nitro/browser/Linux/module/release gates remain operator work, not silently accepted.
- **F-01/F-02 · REV-1.1:** corrected locally. `current-identity.test.ts`, `current-identity-http.test.ts`, `auth-epoch-migration.test.ts` and guarded `tests/integration/current-identity.test.ts` prove current-role/active/epoch authorization, owner-only mode, encrypted copied/legacy/pending cookie rejection, outage fail-closed behavior, idempotent/interrupted/no-progress migration and actual security/device writers on Node 22.22.0 / SDK 2.0.3 / DB 3.2.4+20260803.93ab219. See [route audit](./auth-route-matrix.md). Coordinated reader/writer migration and operator/build/browser/release gates remain pending; MFA replay/setup/CSRF findings remain open.
- **F-05/F-06 · REV-1.3:** corrected locally. `password-admission.test.ts`, `password-routes.test.ts`, `password-native.test.ts` and converted baseline cases validate atomic chosen-map reservations/untouched expiry/cardinality, pre-work real H3 IP/account admission and actual bounded Argon2 work/abort/shutdown/native RSS. Node 22.22.0; no configured storage, DB or legacy-file cleanup. Single-process/restart-reset/coarse proxy policy is explicit; production mixed-load/release gates remain pending.
- **F-04 · REV-1.4:** corrected locally. `outbound-transport.test.ts`, `security-alerts-bounded.test.ts` and converted baseline classifier regressions cover denial-before-connect, exact pinning, deadlines/disposal/admission and real loopback TLS Host/SNI/trust/name checks on Node 22.22.0. Image/webhook callers share transport; no private service or configured target was probed. Deployed egress/proxy/module/release gates remain pending.
- **F-12 · REV-1.6:** corrected locally. `media-storage-startup.test.ts` unit/real-fixture suites prove current/missing/old/corrupt markers preserve synthetic catalog/settings/bytes, unsupported layouts refuse before schema/backfills, and fresh initialization retries/reenters without reset. Real Node 22.22.0 / SDK 2.0.3 / DB 3.2.4+20260803.93ab219. Historical conversion and operator approved-copy/deployment gates remain pending; no configured data was used.

## Baseline commands and observed results

These were executed during the preceding review, before this docs-only handoff. They are **not** a new post-fix test run:

| Command/check | Result | Scope/limitation |
|---|---|---|
| `npm run test:unit` | 63 files passed, 1 skipped; **891 tests passed, 16 skipped** | Node 24.15.0; default suite, no opt-in live DB run |
| `npx eslint server --quiet` | Passed | Server ESLint only; **not** a full `npm run lint` claim |
| `npm run typecheck` | Passed | Available Node 24 environment; no Node 22 compatibility claim |
| Mapped-IP classifier probe | All three test addresses below returned false for blocked/private | Actual shared helper; duplicate importer was checked by source; no network connection |
| Concurrent limiter probe | limit=1, concurrent=20, allowed=20, persisted count=1 | In-memory fake with asynchronous get/set demonstrates the race; not a real HTTP exploit |
| Unstorage filesystem TTL probe | stored value still present after ttl=1s and wait=1.2s | Actual installed fs driver in an owned temp directory, removed afterward |
| Archiver runtime export/call probe | exports Archiver/JsonArchive/TarArchive/ZipArchive; TypeError: archiver is not a function | Actual installed package on Node 24; verify corrected API on Node 22 |

### Reproduction details for the next agent

Implement durable regression tests in REV-0.1/the owning task rather than relying on temporary shell logs.

**F-04:** parse URL hostname, strip brackets, pass to shared `isPrivateIp`:

```text
http://[::ffff:127.0.0.1]/       -> ::ffff:7f00:1  -> false
http://[::ffff:169.254.169.254]/ -> ::ffff:a9fe:a9fe -> false
http://[fe90::1]/               -> fe90::1 -> false
```

**F-05:** stub `useStorage()` with async `getItem` returning a copy of current state and async `setItem` replacing state. Call 20 `consumeRateLimit('test', '127.0.0.1', { limit: 1, windowMs: 60000 })` promises concurrently. All reads see the initial state; all calls admit and write count 1. Use barriers rather than timing sleeps for the regression.

**F-06:** instantiate `createStorage({ driver: fsDriver({ base: ownedTempDir }) })`; set `probe=1` with ttl one second; read after 1.2 seconds. Value remained one. Driver `setItem(key,value)` ignores the options argument; unstorage core forwards it without implementing expiration itself.

**F-14:** `createRequire(import.meta.url)('archiver')` has type object with named exports. The existing factory call fails. Add a two-file ZIP runtime test and the F-03 permission regression in the same patch.

## REV-0.1 durable reproduction mapping (2026-10-05)

All findings remain **open**; this task adds test evidence, not runtime repairs. On Node 22.22.0, `tests/unit/backend-hardening-baseline.test.ts` records six intentional `it.fails` cases against the desired secure contract:

| Finding | Durable case | Evidence scope / disposition |
|---|---|---|
| F-04 | mapped loopback, mapped metadata, `fe90::1` must be blocked | Real shared classifier/URL normalization; no outbound connection. Open for REV-1.4. |
| F-05 | limit-one burst must reserve atomically | 20 snapshot reads synchronized by a rendezvous barrier; real limiter and fake async store/manual clock. Open for REV-1.3. |
| F-06 | installed filesystem store must expire untouched TTL keys | Installed unstorage 1.17.5 fs driver in receipt-owned temp storage; actual 1.2-second wait. Open for REV-1.3; replacement backend/admission not chosen here. |
| F-14 | existing Archiver factory call must work | Actual `createRequire` factory invocation against Archiver 8.0.0; no private ZIP exposed. Open for REV-1.5 along with F-03 privacy tests. |

Vitest treats an unexpected pass as failure. Owning tasks must remove the expected-failure annotations when they implement the corrections, and add their required acceptance coverage. These tests do not resolve other findings or validate live HTTP authorization. Guard/lifecycle/seed regressions and pending real 3.2.5 acceptance are described in [harness.md](./harness.md) and [progress](./progress.md). Required 3.2.5 official artifacts were unavailable; an actual 3.2.4 executable was refused before server startup. No DB transaction/import/scale result is claimed.

### User-approved 3.2.x follow-up (2026-10-05)

The user subsequently authorized **stable SurrealDB 3.2.x**, superseding the strict 3.2.5 blocker above. The real Node 22.22.0 / SDK 2.0.3 / **3.2.4+20260803.93ab219** fixture now passes **7 tests in 2 files**, including two fresh starts/stops, transaction commit/rollback, streamed HTTP import and independent content verification, plus the six existing grouped-error checks. Exact versions, separate test-driver/DB RSS snapshots and limitations are in [progress](./progress.md).

Real fixture corrections: cancelled statements throw an SDK QueryError; `/import` requires `OPTION IMPORT;` first and suppresses results (`[]`); an explicit count alias avoids assuming scalar `SELECT VALUE count()` output. These are recorded as fixture-contract evidence, not newly claimed application defects. REV-2.3/2.4 should explicitly validate legacy/exported dump prologues and 3.2.x import acknowledgement/error semantics on their own fixtures. No security/privacy fix, application query-plan/permission/scale result, or production approval follows from these checks; **all F-01–F-27 remain open**. Earlier 3.2.4 refusal and 3.2.5 availability observations remain historical.

## Things not established by the review

- Actual deployed memory exhaustion, exploit success, production row counts or production latency.
- New 3.2.5 `EXPLAIN`, index-order correctness, transaction conflict behavior, ROOT/EDITOR permission matrix, streaming `/import` DB memory, partial snapshot semantics or crash recovery.
- A new Node 22 production build, browser CSRF/shared-cache exploit test, Linux link/fsync tests or optional-module matrix.
- Safety of arbitrary uploaded SurQL. A ROOT staging import is not a hostile-input sandbox.
- A retention bug from earlier fixture seeding OOM. Logging progress explicitly states the OOM happened during seed before retention; retain that distinction.

## Resolution record

All F-01 through F-27 are **open at handoff**. For each resolved/disproved item append:

```text
F-xx — resolved / disproved / accepted-risk (task, revision/date)
Evidence: committed test names; actual runtime/DB versions; result and limitations.
Behavior/migration change: ...
Remaining operator gate: ...
```

Do not delete original evidence when a finding is superseded. A disproved hypothesis should keep the experiment that disproved it.
