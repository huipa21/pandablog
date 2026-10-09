# Spec 00: Restore-scoped maintenance architecture

Applies to **MS-01–06** in [plan](../plan.md). **Approved target, not current behavior.** [Progress](../progress.md) is the status/evidence source.

## 1. Operational boundary

Production has one application container/process, replaced stop-before-start. No application lifetime disk ownership is needed. Backups and the password-reset CLI can execute as separate processes against the same storage/DB; their job serialization is still required. The single-container assumption is not permission to run a reset during wipe or remove cross-process job protection.

Development Nitro can transiently overlap replacement Worker threads. Handle its lifecycle with bounded drain/generation protection and actual runtime tests, not persistent application-owner receipts or hostname/PID heuristics. No production multi-worker/cluster support is added.

## 2. Separate three concerns

| Concern | Required behavior | Persistence |
|---|---|---|
| Initialization/readiness | One boot flight, sanitized state, ordinary work waits/refuses until required boot succeeds | No ordinary-startup owner/recovery receipt |
| Resource and job admission | Finite active/waiting/byte/time budgets; backup-family and CLI job serialization | Job exclusion may use disk/process primitives; stale nonrestore ownership is not permanent startup recovery |
| Destructive restore | Close traffic/background admission, drain, stage/verify, journal before destructive cutover, verify commit/rollback | Durable restore intent/progress/safety artifacts survive process death |

A temporary uncertain-write window may persist to delay destructive maintenance across restart. It is **not expert recovery evidence**, never a normal-startup block, and must expire automatically under a documented DB execution bound. Independent domain receipts (setup, logging migration, media claims) remain data/security controls, not application-owner receipts.

## 3. Invariants

1. Ordinary container death/replacement never requires asserting DB quiescence/data consistency solely to remove application ownership.
2. Invalid config or incomplete required initialization never yields ready HTTP/SSR/cached routing or starts ordinary schedulers. No ignoring errors to make the site appear healthy.
3. Ordinary initialization failures are diagnosed in memory; correction/restart retries required idempotent/resumable work without clearing a general maintenance receipt.
4. Restore cannot wipe/import/swap while preexisting foreground/background/native/FS work can still mutate or publish into that generation.
5. Caller timeout/socket disconnect is not execution cancellation. Retain bounds/admission until actual execution settlement; do not replay ambiguous writes.
6. Durable destructive intent precedes the first operation that can replace live DB/media. A crash in that interval is a restore-recovery case even if wipe has not yet dispatched.
7. Verified pre-destructive interruption and terminal restore outcomes do not require expert startup-only archival. Unknown/corrupt evidence plausibly describing destructive restore remains conservative.
8. Token/generation-safe job release and publication prevent old cleanup from deleting successors or republishing stale cache/media.
9. No schema/init path deletes media, changes a marker to pretend compatibility, resets existing users/passwords or changes retention merely to resume service.
10. Health/readiness/status/CLI diagnostics are bounded and sanitized; no SQL, credentials, cookies, owner/capability tokens, private records or secret-bearing paths.

## 4. Target flow

```text
startup -> synchronous request/close registration
        -> validate config -> classify restore state -> one initialization flight
        -> optional ROOT bootstrap -> scoped schema/migrations/reconciliation
        -> ready -> ordinary bounded work

request/background -> readiness + in-memory restore admission
                   -> existing subsystem/query/native limits -> actual settlement

backup/import/consolidate/delete/reset -> serialized job owner -> bounded work
                                    -> verified token-safe release

restore -> job owner -> close ordinary admission -> bounded drain
        -> validate staged inputs + verified paired safety state
        -> durable destructive intent -> wipe/import/schema/auth/media work
        -> verify commit or paired rollback -> terminal journal -> reopen

ordinary crash -> initialize replacement; no application-owner recovery
restore crash before destructive intent -> bounded verified abort/cleanup -> initialize
restore crash after destructive intent -> preserve evidence -> restore-recovery diagnostics
```

This does not promise DB+FS atomicity, lossless interrupted requests, exactly-once writes, or zero time to reconnect. The user explicitly accepts normal single-instance crash behavior instead of permanent expert fencing. Preserve confirmed security/data failures as failures, not ownership problems.

## 5. Source inventory to recheck

| Family | Current navigation points | Intended disposition |
|---|---|---|
| Application ownership | `server/utils/backups/jobMutex.ts`: `writer`, `startWriter`, `startWriterAfterDevDrain`, `stopWriter` | Remove lifetime receipt/token/host/PID lifecycle; retain restore loading and job APIs as needed |
| Startup | `server/utils/startup.ts`, `startup-config.ts`, plugins `00-maintenance.ts`, `db-init.ts`, `db-lifecycle.ts` | Simplify coordinator; retain config/scoped policy/explicit flight; remove ordinary failure persistence and writer cleanup evidence |
| Request gate | `maintenance-handler.ts`, `middleware/restore-maintenance.ts`, health/ready/status APIs | Lightweight readiness and restore gate; preserve exact exceptions/no recursive error SSR |
| DB | `db.ts`, backup `surrealHttp.ts` | Retain owned clients, in-flight settling on close, disabled SDK replay/reconnect, safe explicit retries, limits, identity separation; use restore leases only where needed |
| Restore/job | backup `jobMutex.ts`, `restore.ts`, `create.ts`, import/consolidate/delete callers | Retain serialization, bounded streams, validation, journal/safety; simplify non-destructive crash policy |
| Background | analytics plugin/session/rollup, logging fire-and-forget/retention, download cleanup, db-init deferred backfills | Ready before start; no new starts during restore/stopping; actual work drained/cancelled safely |
| Setup/media | `setup-authority.ts`, media layout/state/stage/claim recovery and publication | Retain domain security/consistency; remove only general-writer coupling |
| Cache | `public-cache.ts`, Nitro handlers, restore state refresh | Retain per-process/restore generations and privacy invalidation; late old work cannot publish into current state |
| CLI | `bin/panda.mjs`, `scripts/recover.ts`, `scripts/recovery/assistant.ts`, `scripts/password-reset.ts` | Retain read-only inspection and reset semantics; remove startup-only expert remedy; cross-process job exclusion remains |
| Packaging/docs | Dockerfile, production Compose, README, CLI docs, old runbooks/specs/checker | Remove writer-based operational requirements; preserve builds/env/release truthfulness |
| Tests | ownership/barrier/crash/runtime/startup/auth/recovery/media/setup units, real DB restore tests, CLI tests | Replace writer-refusal assertions with ordinary recovery; retain independent restore/security/bounds assertions |

Search by behavior, not only import names. An `ownership.guard`, stale `.job.lock`, generic startup journal or CLI refusal can reintroduce the burden even after `.writer.lock` is gone. Record the full inventory/disposition in progress before completion.

## 6. Retained improvements and explicit non-goals

Keep current-account/epoch authorization, owner policy, MFA/CSRF/SSRF/privacy, setup's monotonic reservation, parameterized/bounded SQL, stream/archive limits, publication/deletion claims, finite KDF/image/query/log/cache budgets, non-destructive media migration and credential refresh at restore. Normal boot creates missing users only, never silently resets passwords; scoped auth never falls back to ROOT.

No distributed locks, Redis, service discovery, broad DB pool, new public recovery endpoint, generic persistent startup-failure audit system, whole historical-code rollback, backup-format rewrite, retention redesign, compatibility marker bypass or auto-import of old safety dumps. No newly authorized removal of `setup-authority.json`, access-log migration receipts or media ownership witnesses.

Implementation may retain a small private in-memory owner context for boot/restore if required to prevent admission deadlocks. Do not count retained class/file names as failure to simplify; judge lifecycle/durability/user-visible behavior and removed branches. Conversely, renaming the old receipt is not simplification.
