# Isolated backend hardening harness (REV-0.1)

**Status: REV-0.1 complete locally on Node 22.22.0 / SurrealDB 3.2.4.** See [progress](./progress.md). This harness is not a production release approval or a replacement for [spec 09](./specs/09-verification.md)'s later browser, scale, fault and operator gates.

## Runtime and commands

- Node **22.22.0**, pinned in `.node-version`, checked by the live fixture and used by CI. Use a runtime manager or an official Node binary; ensure child processes also resolve this Node through `PATH`.
- Stable SurrealDB **3.2.x** executable, supplied as an **absolute path**. The user authorized this target amendment on 2026-10-05; the reproducible CI/default artifact pin is **3.2.4**. No automatic download or version fallback in local commands. Other minors and prereleases are refused; exact builds are recorded. Rerun relevant acceptance on the deployment build.
- Installed SDK/Nuxt/Sharp versions are printed by live acceptance, not inferred from package ranges. At implementation: SDK 2.0.3, Nuxt 4.4.8, Sharp 0.34.5, Vitest 4.1.6, unstorage 1.17.5, Archiver 8.0.0.

Default units do **not** connect to a DB:

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run test:unit -- --maxWorkers=4
# Focused original guard/regression tests (no expected-failure annotations remain):
npm run test:unit -- tests/unit/backend-hardening-harness.test.ts tests/unit/backend-hardening-lifecycle.test.ts tests/unit/backend-hardening-baseline.test.ts
```

Deliberately start disposable fixtures (when the required binary is available):

```sh
npm run test:backend:integration -- --fixture --surreal-bin=/absolute/path/to/surreal
# Windows example: use C:/.../surreal.exe, quoted if it contains spaces.
```

No-argument execution, extra arguments, relative paths, wrong Node and wrong DB versions fail closed. `PB_ERROR_GROUPS_LIVE` no longer enables a fixed-port/static-password test. The runner enables only explicitly listed guarded integration suites (baseline, media startup preservation, current-identity/MFA SQL, media privacy projections, atomic setup/owned receipts, DB lifecycle/privileges, streaming replacement/scale, actual restore worker, Phase 3 scoped media SQL/claims/small-catalog fixture, and Phase 4 exact analytics/session/publication/checkpoint/restore-epoch/raw-retention SQL fixture) and the existing grouped-error live suite, using a sanitized child environment. The default unit suite still skips live DB work.

CI's ordinary verification uses the same Node pin. The separate `workflow_dispatch` boolean `backend-fixture` deliberately opts into the exact 3.2.4 download and acceptance. That job fails, rather than substitutes a version, if the official release is unavailable. CI has **not** been executed locally. The previously ignored CI file referenced an ignored mutation e2e suite through Playwright configuration which loads `.env` and reuses an app server; that invocation is deliberately deferred until REV-5.1 provides an isolated Nitro/browser runner. It is **not** a browser pass.

## Safety and ownership

`scripts/backend-hardening/` tooling never reads `.env`, uses configured application DB credentials, accepts an external endpoint or defaults to `storage/`.

- Each fixture reserves a generated IPv4-loopback port, starts its own memory-only DB child and generates random namespace/database/credentials. Literal endpoint and test-name validation rejects remote, abbreviated or credential-bearing URLs and ordinary application names. Sign-in uses that child's generated credentials. A port race cannot authenticate to an unrelated server.
- The DB binary's `version` command is checked **before** starting the server. SDK and HTTP versions are checked again by acceptance. `surrealdb-` prefixes and build metadata are accepted; other versions/prereleases are not.
- Storage is `mkdtemp` under the canonical OS temp directory, with an in-memory random ownership receipt. Use/cleanup checks the receipt, directory identity and symlinks. Only simple child filenames are accepted. Cleanup never enumerates or stops arbitrary processes/containers and never removes a user-supplied directory.
- Cleanup is single-flight/idempotent, sends signals only to the owned child, waits for closure and preserves the directory if closure/ownership cannot be proven. Tests use `finally`; killing the test process itself may leave its child/temp directory behind. Crash recovery and Linux filesystem acceptance remain later gates; do not use blanket cleanup commands on other fixture directories or processes.
- Credentials are ephemeral, not logged/committed. Child env excludes application variables and `NODE_OPTIONS`. Binary/HTTP diagnostics and response bodies have finite bounds/deadlines. Import redirects are refused, and sources must be owned regular files (no symlink target reads).

## Streaming fixture generation

`writeSqlFixture(ownedStorage, filename, options)` accepts an owned-storage capability, never a configured output path. It creates new files exclusively, streams ASCII SQL through a backpressured pipeline, limits rows/payload/chunk/total bytes, supports aborts, and removes only the file it just created on failure. Defaults: 128-byte payloads, 64 KiB chunks, 128 MiB output budget. Hard configuration maxima: 10 million rows, 64 KiB payload/row, 1 MiB chunks, 16 GiB output. Explicitly select an appropriate total-byte budget before larger workloads.

Generation errors are reported as **seed failures before the operation under test**, not retention/import/restore benchmarks. The smoke uses only 25 synthetic rows, in 1 KiB chunks, streamed through HTTP `/import`. Generated SQL starts with **`OPTION IMPORT;`**, required by real 3.2.4. Import mode suppresses result output and returns **`[]`**: this is an acknowledgement, not a statement/row count. The parser rejects malformed/non-array JSON or any explicit non-OK statement; the smoke independently checks the SDK-visible exact count, all ordinals and every payload before claiming successful import. Cancelled transaction statements throw an SDK QueryError; the smoke asserts that known response and separately proves rollback. It commits and cancels real transactions and starts/stops fresh fixture processes **twice**. Existing grouped-error tests run on a separately owned DB.

The smoke emits OS/runtime/package versions, host memory, driver `rss/heapUsed/external/arrayBuffers`, separate DB RSS, encoded seed bytes/chunk size, returned statement count and elapsed time as JSON on stdout. These are **test-driver/DB fixture measurements**, not idle application RSS, production memory, scale guarantees or a constrained 2-vCPU/1-GiB/2-GiB rehearsal. Those workloads and an idle Nitro app baseline remain pending in progress.

## Phase 4 partial acceptance

The standard guarded command also runs `tests/integration/analytics-phase4.test.ts`. It uses actual application SQL and isolated stable 3.2.x only: atomic visitor/session/pageview claims, salt initialization/legacy values, exact small totals/cross-midnight durations, bounded groups, summary rollback/replacement, checkpoint replay, publication invalidation after a restore and raw deletion refusal for unpublished/unfinalized/stale-epoch days. Seeds are 100-row batches, never a whole-corpus allocation. It prints actual build, scalar response bytes, Node memory, separate point-in-time DB RSS and EXPLAIN; these are not sampled peaks or a constrained Nitro benchmark.

Focused default (no DB) tests are `analytics-bounds.test.ts`, `analytics-track-http.test.ts`, `access-log-bounds.test.ts`, existing access reader/store/purge suites and `logging-file-api.test.ts`. Access scale fixtures own only OS temp paths. **This does not complete Phase 4:** summary history retention needs an approved policy; unknown-count purge, global DB logging/deletion reports, graph, FTS/backfills and public-cache/runtime work remain open in [progress](./progress.md).

## Evidence, not fixes

`tests/helpers/backend-hardening.ts` supplies an injectable manual clock and a rendezvous barrier; concurrency reproductions use snapshots plus barriers, not timing sleeps. Real filesystem TTL uses actual elapsed wall time and the installed driver.

Phase 0 introduced six `it.fails` cases in `backend-hardening-baseline.test.ts`: F-04 (three addresses), F-05 (limit-one burst), F-06 (filesystem TTL), F-14 (factory invocation). REV-1.4 converted F-04's three cases to normal passing regressions; REV-1.3 converted F-05/F-06 to normal chosen-backend regressions. REV-1.5 converted F-14 to the real named-constructor regression; no expected failures remain. These are deliberate expected failures against the desired secure contract. **An unexpected pass fails the suite.** The owning repair task must replace/remove the annotation and add its full regression coverage; six expected failures are not six repaired findings. Guard/lifecycle/generator tests are ordinary passing tests. Neither mocked process lifecycle nor a refused binary alone satisfies real two-start/transaction/import acceptance. The original Phase 0 real 3.2.4 run passed **7 integration tests** across two files; Phase 2 passed **17 tests / 9 explicitly guarded files**; Phase 3's standard guarded run passes **18 tests / 10 files**, including the two-start smoke and six existing grouped-error checks. The exact build, earlier failed probes and remaining gates are recorded in progress; harness infrastructure alone does not close findings. Phase 2 uses the real application worker on owned DB/media, including full/partial commit, incremental paired rollback, current-runtime password reprovisioning and historical variants. Its separate streamed fixture generates **12,288 rows / 101,476,675 bytes / 64-KiB chunks** and independently verifies import counts/export. Sampled driver/DB RSS is printed separately; this is not Nitro, a constrained production benchmark or an arbitrary-size restore guarantee. See [operations](./operations.md#5-database-and-restore-safety-phase-2-locally-implemented) and [writer inventory](./writer-inventory.md) for quotas, trust boundaries and offline recovery. Phase 3 adds `media-phase3.test.ts`: actual scope-filtered page/count/FTS/Rust regex/facet and claim/reservation SQL, a 1,000-row bounded-seed heavy-metadata catalog, and a 24-row ~27.8-KiB result. Its injected owned storage adapter tests the real publisher DB flow/file copies, while separate unignored unit/H3/native/FS suites validate streaming and exclusive inode witnesses. These combined local proofs do not claim a DB+FS atomic transaction, Linux power-loss safety, a full media process-crash rehearsal or a constrained production envelope. Phase 3 limits and the intentional legacy reference/deletion hold are in [operations](./operations.md).
