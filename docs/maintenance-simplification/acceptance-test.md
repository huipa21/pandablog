# Maintenance simplification: acceptance matrix

**Status: target checks, not implementation passes.** Result/evidence links belong in [progress.md](./progress.md). `pending`, `blocked`, historical evidence and a source-confirmed path are not a passing new runtime test.

## 1. Evidence and fixture rules

Use [backend harness](../backend-hardening/harness.md) and [verification spec](../backend-hardening/specs/09-verification.md). Required supported pin is Node **22.22.0** (recheck repository pin), stable SurrealDB **3.2.x**, default reproducible DB **3.2.4**; record exact SDK/Nuxt/Nitro/H3/DB build/OS rather than package ranges. Node 24 and Windows-only tests supplement, not substitute for required Node 22/Linux evidence.

Generate owned temp storage and loopback DB/processes with sanitized environments. Never read real `.env`, reuse `storage/`, connect to a configured DB/server, kill unrelated processes, perform a live backup/restore/reset or seed using real credentials. Build/browser fixtures need an owned source copy excluding secrets/user data/generated outputs. Explicitly verify all child targets/config/ownership before cleanup.

## A. Ordinary lifecycle: no persistent app ownership

| ID | Required assertion | Evidence tier / task |
|---|---|---|
| A1 | Clean boot/close/boot succeeds; no `.writer.lock` created or application-owner publication guard used | Unit + actual Nitro/FS; MS-02 |
| A2 | Forced death while ready, with no restore, permits replacement boot without expert flags/archival | Owned processes + production Nitro; MS-02/06 |
| A3 | Forced death during ordinary initialization/DB retry permits bounded repeatable replacement boot | Unit + actual Nitro/DB subset; MS-02/06 |
| A4 | Invalid config then corrected fixture config starts normally; no generic failure receipt | Unit + actual Nitro; MS-02 |
| A5 | Non-connectivity boot error leaves failed instance unready; corrected next start succeeds without receipt clearing | Unit + actual init/FS/DB; MS-02/06 |
| A6 | Slow/rejected boot in Nitro's non-awaited plugin loop cannot admit ordinary auth/setup/API/SSR/local-fetch/cache/background work; every rejection handled | Actual plugin + Nitro routing; MS-02 |
| A7 | Close during boot/retry; late connect/initialization/disposal never publishes ready or starts jobs; timeout creates no ordinary crash latch | Unit + owned Nitro lifecycle; MS-02 |
| A8 | Grace expiry/forced ordinary container exit then replacement recovers; hostname change and container PID reuse do not matter | Owned Linux/container; MS-06 |
| A9 | Full actual dev watcher reload and forced ordinary Worker replacement recover without stale-writer wait/receipt; retired generation cannot republish | Actual Worker + full Nuxt dev; MS-02/06 |

## B. Readiness and retained DB behavior

| ID | Required assertion | Evidence tier / task |
|---|---|---|
| B1 | Health liveness vs readiness; no-store sanitized 503 and exact exceptions; HTML/API fence does not recurse into error SSR or DB logging | Unit + real H3/Nitro; MS-02 |
| B2 | Boot outage automatically retries with finite backoff; DB returns -> required boot completes -> ready, no recovery assistant | Mock timing + actual DB/Nitro; MS-02/06 |
| B3 | Runtime DB loss closes/discards client, settles pending calls, releases admission and reconnects single-flight without slot/socket/timer growth | Existing/new lifecycle tests + real SDK; MS-02/06 |
| B4 | Driver reconnect replay remains disabled; ambiguous writes never auto-replayed; explicit read/idempotent policy retained | Unit + real SDK/DB fault; MS-02/06 |
| B5 | ROOT bootstrap creates missing target/user only; disposal precedes scoped schema; wrong scoped password never resets user/downgrades | Existing guarded identity/bootstrap integration; MS-02/06 |
| B6 | Query/native/KDF/image/stream/queue/byte/deadline budgets retained; caller timeout is not early execution release | Targeted unit/native/SDK; MS-02/03/06 |
| B7 | Temporary uncertainty expires automatically across restart; malformed/future timestamp bounded; normal boot/requests/shutdown not fenced | Unit clocks + owned FS; MS-02/03 |
| B8 | Crash without uncertainty receipt cannot immediately enable destructive overlap with old DB execution; documented finite job-only hold/equivalent tested | Unit + real SDK/server-bound rehearsal; MS-03/06 |

## C. Restore admission: all lanes, not only new HTTP

| ID | Required assertion | Evidence tier / task |
|---|---|---|
| C1 | Active save remains admitted after socket disconnect; restore waits for actual completion; new requests denied | Real H3 + deterministic rendezvous; MS-03 |
| C2 | Pending DB call after caller timeout retains lease/admission; drain failure aborts before intent/wipe and does not permanently fence normal service | Unit + real SDK fault; MS-03/06 |
| C3 | Media native/FS publication/reference/deletion cannot race wipe/media swap; no socket-close early cleanup | Existing/new H3/native/FS/DB; MS-03/06 |
| C4 | Analytics tracking/session/rollup, logging writes/flush/retention, download cleanup and deferred backfills pause/drain; no detached publication | Unit + relevant real integration; MS-03/05 |
| C5 | Restore owner performs queries/FS while ordinary admission is closed without deadlock; request code cannot forge owner/bypass | Unit + actual restore; MS-03 |
| C6 | Exact health/readiness/expiring restore capability/static exceptions only; login/setup/auth/backup mutations do not bypass | H3/Nitro + current/stale auth; MS-03/05 |
| C7 | Cache/settings/auth/analytics epochs refresh; old-generation pending work cannot become current publication after commit/rollback | Unit + actual Nitro/restore; MS-03/05/06 |

## D. Serialized jobs including CLI

| ID | Required assertion | Evidence tier / task |
|---|---|---|
| D1 | Synchronous local reservation gives one contender; job mutex serializes create/import/restore/consolidate/delete/prune as applicable | Unit + owned FS/processes; MS-03 |
| D2 | Password-reset process vs app job, two reset processes and offline CLI/app job contention serialize; old release cannot delete successor | Owned processes + reset fixture; MS-03/04 |
| D3 | Ordinary create/import/consolidate/reset process crash does not block site initialization; safe abandoned ownership allows later jobs without expert DB-consistency assertions | Owned FS/processes; MS-03/04 |
| D4 | Transient/abandoned guard cannot become a new generic startup latch; live owner is not stolen on TTL/PID reuse | Deterministic contention + legacy fixtures; MS-03/04 |
| D5 | Job release/errors/IO/corrupt nonrestore owner never falsely report completion or globally fence ordinary traffic | Unit + owned FS fault; MS-03 |

## E. Destructive boundary and restore recovery

| ID | Required assertion | Evidence tier / task |
|---|---|---|
| E1 | Crash at preparing/validation/safety snapshot before destructive intent, using trustworthy legacy/current evidence, auto-aborts safely; no expert startup recovery | Owned processes/FS + DB subset; MS-03/06 |
| E2 | Destructive intent is durable before first wipe/import/live swap; kill after intent but before dispatch stays a restore-recovery case | Deterministic dispatch boundary + owned process; MS-03 |
| E3 | Kill after wipe/import/verify/media swap/regeneration/finalize/rollback with no verified terminal outcome preserves paired safety/journal/artifacts and denies ordinary boot/traffic | Owned process matrix + actual DB/media; MS-03/06 |
| E4 | Valid terminal committed/verified rollback/non-destructive abort restarts normally; inspector does not refuse just because journal exists | Unit + owned FS/actual restore; MS-03/04 |
| E5 | Corrupt/unknown/contradictory journal, missing journal with restore job or old-media swap evidence remains conservative; no marker guessing | Unit + owned FS; MS-03/04 |
| E6 | Full/partial/incremental/empty-media round trips preserve selected-table deletion semantics, history, original-month variants, runtime credentials and session revocation | Guarded real SDK/DB/media worker; MS-06 |
| E7 | Synthetic failure after destructive cutover permits reopen only after verified paired DB+media rollback; ambiguous execution/failed rollback stays restore-recovery | Fault unit + real paired rollback; MS-03/06 |
| E8 | Corrupt gzip/checksum/parent cycle/archive traversal/symlink/bomb/disk-full/failed stage fails before wipe and preserves live data | Existing/new stream/archive/FS tests; MS-03/06 |
| E9 | Linux file/directory sync/atomic rename/mount/permissions and killed-container restore behavior exercised; Windows skips not a pass | Owned Linux/container rehearsal; MS-06 |

## F. Legacy records and CLI compatibility

| ID | Required assertion | Evidence tier / task |
|---|---|---|
| F1 | Writer-only valid/dead/live-looking/remote/reused-PID/empty/corrupt/unreadable/partial/symlink fixtures do not block startup and remain byte/path unchanged | Unit + owned FS/Nitro; MS-02/04 |
| F2 | Writer + expired/pending/corrupt uncertainty has normal readiness, with bounded job-only hold; writer + destructive restore remains restore-fenced | Unit + owned FS; MS-04 |
| F3 | Legacy `.job.lock` file/directory, guard and terminal/pre-destructive/destructive/corrupt journal/artifact combinations follow spec 03; unfamiliar files untouched | Unit + owned FS/processes; MS-04 |
| F4 | Recovery CLI inspection neither loads `.env` nor contacts DB/Nitro nor prints tokens; retired writer reported informationally; destructive restore reported accurately | Actual dev + bundled CLI; MS-04 |
| F5 | Old startup-archival invocation is safely refused/deprecated with no mutation; new help/status/exit semantics match all consumers | Actual CLI + API/UI tests; MS-04/05 |
| F6 | Reset still has hidden interactive password policy, existing-user-only update/new epoch/scoped identity, no replay and correct job-release/uncertainty handling | Existing/new reset units + guarded DB + bundled CLI; MS-04/06 |
| F7 | No automated removal of DB/media/setup/log migration/unknown safety data; ignore retired receipt does not follow unsafe paths | Unit + owned filesystem snapshots; MS-04 |
| F8 | Missing/different media marker preserves records/settings/originals; legacy missing fields/page interruption remain resumable; no old destructive reset reintroduced | Existing/new real startup-preservation SQL/FS; MS-02/06 |

## G. Integration and release scope

| ID | Required assertion | Evidence tier / task |
|---|---|---|
| G1 | Full lint, production-mode typecheck, default units and diff checks; supplementary bounded-worker result separately recorded | Node 22; MS-06 |
| G2 | Full-feature and minimal single-author production build/smoke; backups/logs/analytics-disabled touched combinations; unresolved destructive restore still detected with backups disabled | Owned full Nuxt/Nitro/module builds; MS-05/06 |
| G3 | Real browser en/zh-CN login/public/admin/backups unavailable/ready states and SSR polling have no new regressions | Owned browser/app/DB; MS-06 |
| G4 | README/help/runbooks/specs/inventory/Compose/checker agree on single-instance deployment and ordinary vs destructive crash; translated UI changed together | Source/docs + tool regressions; MS-05/06 |
| G5 | No newly fabricated historical passes/release manifest records, no unrelated retention/security/API changes; final diff reviewed | Source/manual review; MS-06 |
| G6 | Production-copy/mount/backup/downgrade/proxy/deployment/overnight checks explicitly operator-owned and pending until evidence supplied | Operator; outside code assignment |

## 2. Commands and existing starting points

Run from an environment whose Node/PATH and children use the supported pin. Typecheck must not load the actual secret-bearing `.env`:

```sh
npm run lint
NODE_ENV=production node node_modules/@nuxt/cli/bin/nuxi.mjs typecheck --dotenv=false
npm run test:unit
npm run test:unit -- --maxWorkers=4  # supplementary
npm run test:unit -- tests/unit/backup-ownership.test.ts tests/unit/startup-coordinator.test.ts tests/unit/maintenance-barrier.test.ts tests/unit/maintenance-crash.test.ts tests/unit/recovery-assistant.test.ts
npm run test:backend:integration -- --fixture --surreal-bin=/absolute/path/to/surreal
git diff --check
```

New test/helper paths are ignored by default in this repository. Add scoped `.gitignore` allowlist entries where needed and verify with `git check-ignore`; do not leave acceptance coverage only in ignored local files or broaden the whole tests/scripts policy.

Names above are starting points, not a fixed post-refactor test list. Also recheck `runtime-startup.test.ts`, `runtime-nitro.test.ts`, `startup-auth-recovery.test.ts`, `db-lifecycle.test.ts`, `db-reconnect.test.ts`, media storage/startup preservation, setup maintenance, password-reset/CLI and restore integration suites. Add durable tracked tests for missing cases, not only mocked replacements.

Use the safe owned-source-copy build/browser protocol from [release handoff](../backend-hardening/release-handoff.md); do not run configured-checkout `npm run build`, `npm run dev` or legacy Playwright scripts as isolated evidence. New container tests create only their own generated image/container/volumes; no `compose down` on the user's deployment.

## 3. Reporting rules

For each group list concrete test names, exact commands, runtime/build/OS, counts/skips/failures, evidence tier, baseline/new behavior and remaining gaps. Full-app build OOM and intermittent dev-fixture timing issues are historical observations to recheck, not assumed current blockers or excuses to declare pass. Do not increase heap/limits blindly or weaken tests to hide failures.

Mandatory local environment missing -> `blocked` for affected acceptance; perform available independent checks. Existing unrelated backend Phase 4/release tasks remain in their own ledger. A new passing refactor suite does not complete them or authorize deployment.
