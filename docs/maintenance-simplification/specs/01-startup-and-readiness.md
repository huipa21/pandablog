# Spec 01: Lightweight initialization, readiness and shutdown

Tasks: **MS-01, MS-02, MS-05, MS-06**. Read [architecture](./00-architecture.md), [restore state](./02-jobs-and-restore.md) and [legacy compatibility](./03-compatibility-and-cli.md). Approved target only.

## 1. Observable lifecycle

Equivalent state names may be retained to minimize API changes:

| State | Ordinary traffic/background work | Recovery guidance |
|---|---|---|
| starting / initializing | Fast bounded 503; no retained request/body queue; boot's private work allowed | Wait; DB outage retries in process |
| ready | Normal bounded work unless restore closes admission | None |
| failed | Static/sanitized failure response; no ordinary work | Correct config or named initialization problem; restart normally |
| restoring | Exact diagnostic/static/status exceptions only; already-admitted work handled by drain | Restore in progress |
| restore-recovery-required | Ordinary boot migrations and traffic disabled; status/liveness available | Preserve interrupted restore evidence and use restore runbook |
| stopping | No new ordinary/background/job starts; bounded drain/disposal | Wait/retry after replacement |

`/api/health` remains liveness, not initialization success. `/api/ready` is 200 only after required initialization and with restore admission open; otherwise no-store 503 with sanitized state/reason and truthful retry/guidance. Keep existing response shape where useful; if an additive `restore-recovery-required` reason is needed, update UI/types/tests/docs together.

`guidance.recoveryRequired` is not a blanket diagnostic for ordinary boot failure. Use it for actual/ambiguous destructive restore only in this maintenance contract. Config/media/schema/domain errors can still require fixing their underlying cause; they do not demand generic ownership archival.

## 2. Synchronous integration with Nitro

Installed Nitro invokes plugins without awaiting asynchronous returns. Requirements remain:

- Register outer request protection and close participation synchronously, before first await.
- One explicit shared initialization promise/state, with every rejection handled. Do not depend on plugin filename ordering to complete boot.
- `db-init` enters its flight only after config and restore-state preflight. No writer receipt acquisition precedes boot.
- Ordinary HTTP/SSR/local fetch/cached route entry and background schedules cannot bypass initialization. A cached successful page is not readiness proof.
- Required config/bootstrap/schema/migrations/settings/media reconciliation finish before readiness. Preserve which operations are required unless a specific bounded resume change is documented and tested.
- Boot can access DB/FS while ordinary request admission is closed without waiting on its own readiness. Keep any trusted private boot scope in memory; never expose a public `ignoreReadiness`/`skipRecovery` flag.
- Exact diagnostics/static exceptions are shared by outer and inner middleware. No broad auth/backups/error-page exception. Failed responses cannot recurse into SSR/DB logging.

Rename/remove the maintenance plugin/coordinator if helpful, but do not make an entire architectural rewrite a prerequisite. The goal is a small boot flight with no persistent app-owner protocol.

## 3. Failure handling

### Invalid configuration

Validate canonical names, credentials, username/namespace/database/session/origin values before privileged side effects. No `.writer.lock`, `.ownership.guard`, generic initialization marker or ordinary recovery archive is created. Report the allow-listed category; correction and restart is sufficient.

### Database connection/authentication outage

Retain current automatic initialization retry: 2-second exponential backoff capped at 60 seconds (recheck current production defaults before changing). A failed scoped sign-in does not downgrade to ROOT or reset the user's existing password. Guidance should distinguish configuration/authentication trouble from a transient network outage where possible, without pretending that a retry will fix a wrong password.

Runtime outage retains single-flight reconnect/backoff. Disposing a dead client settles tracked pending calls so admission slots are not leaked. No reconnect replay of in-flight writes. Recovery to readiness happens once DB is available and required initialization succeeds; no new process or recovery assistant is required.

### Non-connectivity initialization failure

Keep failed process unready with a sanitized boot-step/category. Do not persist generic uncertainty solely because boot failed. Remove the complex "prove pre-mutation failure -> dispose -> prove zero leases -> release writer" branch: without writer authority there is nothing to certify/release.

On the next normal start, run required idempotent/resumable initialization again. Audit boot steps before enabling retry/reentry: schema hash/migrations, auth epochs, version graph, media legacy fields/page budgets, stage reconciliation and settings. Preserve conditionally updated fields, claim ownership and marker ordering; no broad rewrite/reset of partially migrated data.

Automatic retry of arbitrary data/schema/FS errors within the same process is not required. Do not loop indefinitely over a deterministic corrupt record or bypass a refusal. A domain incompatibility remains unready until corrected through its appropriate migration procedure, but creates no permanent application-owner latch.

### Ambiguous ordinary writes

A response deadline or process death may leave a DB operation executing. Do not report cancellation/exactly-once or automatically replay a possibly executed mutation. Normal restart is nevertheless allowed under the single-instance contract. Apply finite DB server execution limits and time-bounded backup/restore quiescence where needed; do not replace the writer lock with a persistent all-traffic uncertainty fence.

## 4. Shutdown

- Immediately stop new HTTP/background/job starts and cancel scheduled retries.
- Stop schedulers, drain admitted work under finite deadlines, close owned DB clients, and release actual job resources with their own ownership checks.
- No application-writer removal, ownership verification or persistent "unclean close" receipt. A deadline failure is logged and affects this process's readiness only.
- Late acquisition/initialization/deferred completion cannot publish ready or start new work after stopping. Make close/disposal idempotent and avoid duplicate hooks racing.
- An active restore still persists its accurate journal/checkpoint and never pretends successful completion; preserve safety artifacts if destructive intent has been published.
- Retain bounded native/image/KDF/FS operation settlement. DB close settles client-side tracked calls but is not server-side cancellation proof.

Current coordinator shutdown default is 10 seconds; Nitro timeout/Compose grace currently provide additional drain allowance. Reconcile final values rather than quoting older conflicting 5-second documentation. Ordinary grace-period expiry/forced exit must not produce expert recovery on replacement.

## 5. Development workers

Remove `.writer.lock` and same-host/same-PID wait logic from hot reload. Verify the actual installed Nitro Worker entry/shutdown messages and full Nuxt watcher separately. Use bounded runtime lifecycle/generation coordination as needed so a retired worker cannot publish readiness/cache/media or run stale migrations after replacement is admitted. Process-level PID is not Worker identity.

Do not resurrect persistent app-owner locks to solve a test fixture or create a dev-only unsafe bypass for domain recovery. A replacement after forced ordinary Worker termination initializes normally. If a Worker dies during destructive restore, the same durable restore rule as production applies. Missing actual watcher acceptance is recorded as a blocker, not claimed from synthetic worker coverage.

## 6. Required acceptance

See [acceptance groups A/B/G](../acceptance-test.md). Include clean/forced start-stop-start, kill while boot/retrying/ready, invalid config then correction, failed migration then bounded restart, slow initialization, real cached/SSR/local-fetch routes, close-during-boot, late disposal, actual dev reload, no application-owner disk writes, and repeated DB loss/recovery without leaked slots/replayed mutations.

Keep the latest `4cfb27f` missing-media-fields fix and browser-only backup polling. Their failures were not solved by writer ownership and must not be reintroduced.
