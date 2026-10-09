# Spec 09: Verification, fault injection and release gates

Tasks: **REV-0.1, REV-5.1, REV-5.2, REV-5.3**; every task uses its applicable subset.

## 1. Evidence hierarchy

Record each result as one of:

1. **Source confirmed:** exact code path and trigger; no execution claim.
2. **Unit/mocked reproduction:** deterministic isolation, no live DB/API proof.
3. **Local real integration:** actual Node/SDK/DB/HTTP/FS with disposable fixtures and recorded versions.
4. **Isolated scale/fault rehearsal:** representative generated/approved-copy data, limits and independent measurements.
5. **Operator production acceptance:** authorized deployment and timestamped actual observations.

The review baseline is in [findings](../findings.md). A passing test suite before changes is not evidence that these missing regressions already pass. Historic logging tests used 3.2.4 in several places; new target validation uses stable **3.2.x** per the user's 2026-10-05 amendment, with **3.2.4** as the explicit fixture/CI pin. Historic runs do not substitute for rerunning new tests; record exact builds and repeat relevant acceptance on the deployment version.

## 2. Isolated harness (REV-0.1)

- Pin a supported Node 22 minor and stable SurrealDB 3.2.x image/binary (current pins: Node 22.22.0, DB 3.2.4); record exact SDK/DB/Nuxt/Sharp versions and OS. See [harness commands](../harness.md).
- Explicit loopback fixture endpoint, generated disposable namespace/database and temp storage directories. Test tooling refuses non-test targets and never falls back to application `.env` or `storage/`.
- Credentials are ephemeral and not committed. Integration tests run only with a deliberate fixture flag and safety validation.
- Use real H3/Nitro handler routing for auth/media/cache boundaries, real filesystem streams for backpressure, and real DB statements for transactions/DDL/permissions/import.
- Keep pure test helpers injectable: clocks, DNS resolver, connector, streams, queue limits, failure points and abort signals. SSRF tests do not contact real internal services.
- Fixture generation streams/batches data. Seed memory/time failures are reported separately from the operation being tested.
- Clean up only owned test processes/containers/databases/directories. Do not stop unrelated containers or remove unrecognized paths.

## 3. Mandatory regression matrix

| Area | Cases |
|---|---|
| Identity | legacy cookie, copied cookie after every revocation trigger, deleted/recreated username, owner-mode switch, invalid/missing user, DB outage, optional-auth routes and Nuxt session endpoint |
| MFA/setup | parallel same/different backup codes, TOTP replay/drift, inactive/revoked pending state, competing enrollment/setup, lost response after commit, CSRF form/text/plain |
| Rate/KDF | atomic limit-one burst, high-cardinality unknown targets, untouched TTL expiry, actual chosen store, queue overflow/cancellation/shutdown/native RSS |
| SSRF | mapped IPv4/hex IPv6/link-local ranges, mixed DNS answers, rebinding, redirect-to-private, valid HTTPS SNI, response disposal and slow-drip overall timeout |
| Media privacy | private original/variant cache, site-private/public transition, missing projection fields, private ZIP selection, cross-user ready ZIP access, absence of legacy IPX transforms |
| Media resources | streaming multipart caps, absent Content-Length, parts/fields/deadline, decoder pixel bomb, concurrent image jobs, abort/disk-full/temp quota |
| Media races | identical upload winner/loser, pHash privacy, reference versus cleanup claim, crash during publish/delete, old-month variant regeneration |
| DB lifecycle | connect/signin/use fail, late connect, stale keepalive, concurrent reconnect, dedicated ROOT, ambiguous write retry, timeout execution, close/drain |
| Restore | lock contention/stale/unreadable owner, active-writer drain, setup blocked, crash each phase/restart fence, full/partial/incremental/empty-media, selected-row deletion, corrupt/hostile-structure archive, rollback DB+media, runtime credential/session/cache refresh |
| Analytics | exact small counts, concurrent sessions, cross-midnight/late events, invalid datetime extrema, high cardinality, checkpoint retry, publish crash, retention blocked on incomplete rollup |
| Logging | huge/no-newline records, newest partial ordering, scan deadline and detail semantics, incremental stats reset, many distinct errors/slow DB, truthful partial purge, cutoff concurrent writes |
| Graph/search/cache | private scopes, bounded expansion, CJK/long-token/current-version recall, interrupted rebuild/concurrent edits, unrelated schema change, cookie-key churn, personalized SSR isolation |

Each task lists the concrete tests/commands added and the evidence tier in progress. Use a finding-to-test mapping when closing the register.

## 4. Scale protocol (REV-5.1)

Record a reference profile rather than assuming the developer machine matches production. Suggested starting profile: 2 vCPU, app 1 GiB memory, DB 2 GiB memory, explicit disk quota; optionally repeat a 512 MiB app profile only if supported. These are test targets, **not current production measurements**.

Capture before/during/after:

- Node RSS, heapUsed, external, arrayBuffers, event-loop delay, active/waiting queues, socket/descriptor counts.
- DB RSS/CPU and query latency/plans; disk input/temp/output/DB volume separately.
- HTTP p50/p95/p99 and health latency under mixed load, operation elapsed time and completion/partial status.
- Fixture size/distribution/encoded bytes, batch size, exact limits, machine/container image versions and command.

Workloads:

1. SQL dump substantially larger than the app memory allowance, compressible and incompressible cases; concurrently poll status/health. Separately measure DB `/import` behavior.
2. Increasing analytics raw events at fixed result cardinality, then increasing unique/path cardinality.
3. Increasing file-library count with fixed small page request; concurrent uploads and cleanup.
4. Busy-day access file with large metadata, enormous single-line input, concurrent stats/list/export and compression.
5. Many unique error fingerprints against delayed/unavailable DB.
6. High-degree graph and large CJK/current+historical block corpus; concurrent edits/rebuilds.
7. Random cookies/search/cache keys over a sustained period to verify expiry/eviction, not just freshness.

Success means hard admission/byte limits are respected, no unbounded memory trend across repeated runs, no incorrect data loss/authorization, and an explicit measured performance envelope. Do not invent a universal p95 target after observing results: set the supported workload/latency target before the final run and record it. If a finite-size cap is the only safe DB import limit, document and enforce it rather than claiming arbitrary-size restore.

## 5. Failure injection

Use deterministic injection and disposable processes to interrupt after journal/DB commit/fsync/rename/checkpoint/publication boundaries. Test disk full, permission denied, corrupt/truncated files, malformed HTTP 200, socket close, slow body, abort and process death.

For each failure record:

- Which durable artifacts exist and which owner/generation owns them.
- What clients can read/write during recovery.
- Whether restart resumes, rolls back or remains fenced.
- Why no published/owned data is removed by a stale worker.
- Cleanup of handles/queues/temp data and bounded diagnostic output.

Linux symlink/fsync/rename tests skipped on Windows must run before release. Do not reinterpret Windows skips as filesystem safety passes.

## 6. Build and module matrix

- Required: full lint/typecheck/unit suite on supported Node 22; production build and local production-server smoke.
- Full-feature and minimal single-author build; relevant combinations with analytics/logs/backups/MFA/multi-user/graph disabled. At least test modules touched by each task.
- Runtime DATABASE-scoped user and separate privileged maintenance credentials. Legacy ROOT fallback, if retained, has explicit warning/test.
- Real H3 static/dynamic route specificity, browser en/zh-CN auth/media/admin smoke, and public SSR personalized-cache separation.
- Tests touching Nuxt configuration use fixture environment variables, never display real secrets.

## 7. Release gates (REV-5.2/5.3)

Before deployment:

- [ ] All local tasks/regressions complete, evidence linked, remaining findings have a disposition.
- [ ] Approved production-copy rehearsal with separate DB/media/log mounts; no live source writes.
- [ ] Verified backups and rollback image/config/schema compatibility; record expected session invalidation and owner recovery.
- [ ] Persistent journal/temp/media/log paths, UID/GID, free-disk reserve and resource budgets verified.
- [ ] Existing public-media CDN/proxy entries purged or risk explicitly accepted; new policy tested through actual proxy.
- [ ] Supported single-writer deployment enforced; no overlapping old/new writer during incompatible schema transitions.
- [ ] Operator explicitly authorizes cutover; a code task's `done` is not authorization.

After deployment:

- [ ] Owner can log in; pre-upgrade/stale sessions fail; roles/private media/CSRF work through proxy.
- [ ] Jobs/status/health show correct readiness; sample upload/ZIP/read/backup restore rehearsal succeeds on approved staging.
- [ ] Capture actual RSS/DB/disk/latency and 24-hour/overnight retention/checkpoint behavior.
- [ ] No new queue overflow/credential/lock/recovery warnings unexplained; rollback procedure remains available.

## 8. Progress entry template

```text
### YYYY-MM-DD: REV-x.y (status; local vs release scope)
- Baseline revision / changed files:
- Regression reproduced (evidence tier):
- Implementation and schema/API/runtime changes:
- Decisions/deviations:
- Commands, versions, test counts and results:
- Live fixture/scale measurements (or explicitly not run):
- Remaining blockers/operator gates:
- Next eligible task:
```

Use durable committed test names/commands and sanitized summaries. Temporary absolute log paths alone are not a reproducible evidence record.
