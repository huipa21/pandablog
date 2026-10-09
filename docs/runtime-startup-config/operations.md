# Runtime startup and environment configuration: operations

> **Current lifecycle amendment:** the [maintenance runbook](../maintenance-simplification/operations.md) replaces writer-only expert recovery. The working tree has no application writer receipt; exact local evidence and remaining build/operator gates are in [maintenance progress](../maintenance-simplification/progress.md). Old images retain their old behavior; this is not deployment authorization. Environment/identity guidance below is unchanged.

**Implementation exists in the working tree; full-app build/release acceptance is not complete.** See [progress.md](./progress.md). No deployment, credential cutover or recovery is authorized by this patch. Preserve the [backend recovery runbook](../backend-hardening/operations.md#offline-recovery-no-public-unfence-endpoint).

## Current startup and recovery

- Synchronous outer Nitro protection and close registration; one private boot flight validates config, classifies actual restore, performs required scoped initialization, then opens ordinary admission. No `.writer.lock` or application publication guard is created/read/released.
- `/api/health` is liveness. `/api/ready` is no-store 200 only when initialized/admission open; otherwise sanitized 503 with `Retry-After: 15`. Ordinary config/data/migration failure stays unready in that process, with `fix-config-and-restart` and `recoveryRequired:false`; correction and normal restart rerun resumable initialization without receipt clearing. DB connectivity/sign-in outages retry automatically (2s doubling to 60s); no ROOT downgrade or user password reset.
- Ordinary crash/OOM/forced container replacement restarts normally. Retired writer/guard objects remain untouched, including corrupt, unreadable, symlinked, remote and reused-PID records. Single-instance exclusion is deployment-owned: stop/remove before replacement; no rolling app overlap.
- Shutdown is bounded at **10 seconds**; late boot cannot publish readiness. Nitro's 15s shutdown and Compose's 45s grace remain useful. No ordinary failure/unclean-close receipt exists. Dev Workers use process-local bounded drain messages, not persistent PID/hostname ownership.
- Backup-family jobs and reset CLI remain serialized. A new app has a ten-minute job-only execution hold; observed abandoned app/CLI jobs get a finite exact-generation hold before takeover. DB query/transaction server timeouts must be below ten minutes. Unknown/remote/partial nonrestore records may require an offline **job-only** remedy after stopping all jobs and preserving exact metadata, never DB-consistency assertions just to start the site.
- Uncertain write markers impose finite job-only holds, never ordinary readiness/shutdown fences. Expired records remain informational (not unlinked across a possible concurrent CLI publication).
- Trustworthy pre-destructive restore preparation is durably aborted at preflight, with bounded owned staging cleanup. Verified terminal journals do not block. Only destructive/ambiguous restore requires offline administrator recovery; preserve journal, paired DB/media safety and swap artifacts. Independent setup/access-log/media receipts retain their domain protections.
- `panda recover` is read-only restore inspection (`clear` or `manual-recovery-required`), without env/DB/SQL/token output. Old startup archival/assertion flags are rejected before I/O. No force-unfence, automatic safety import or public recovery endpoint exists. See [CLI reference](../versioning-and-cli.md#recovery-panda-recover).

<details>
<summary>Historical RSC lifecycle instructions (superseded; NOT current operations)</summary>

## 1. Startup and diagnostics

Nitro 2.13.4 does not await plugins. Protection and close registration are now synchronous; a shared owned startup flight validates configuration, acquires the writer, performs required initialization with private boot authority, and only then opens ordinary admission. Optional deferred backfills retain their previous post-readiness behavior and ordinary leases.

| State | Ordinary HTTP/SSR/local fetch and background work |
|---|---|
| `starting`, `initializing` | Denied immediately; no retained request/body queue |
| `ready` | Normal leases; an active maintenance fence still makes readiness false |
| `recovery-required`, `failed` | Fenced diagnostic service; no automatic reopen |
| `stopping` | No new ordinary work; bounded settlement/cleanup |

Startup failure policy is **fenced diagnostic service**, not uncontrolled async rejection or ordinary service. D-07 separates verified pre-mutation failures from partial/unknown initialization. Invalid configuration creates no writer receipt or recovery marker. A trusted handshake failure before any potentially mutating query or handoff to application migrations creates no recovery marker **only after** bounded client disposal, zero active/uncertain leases and token/generation-verified writer release. Correct configuration/connection and restart normally; the failed process never publishes readiness. Provisioning dispatch, migration/FS handoff, unfinished execution, failed disposal/release or unknown errors remain conservative and preserve recovery authority. No raw SQL, password, endpoint, owner token or nested error cause is logged by the startup coordinator.

- `GET /api/health`: liveness only. A 200 is never ownership/readiness proof.
- `GET /api/ready`: 200 only after required initialization and with admission open; otherwise a returned (not thrown) sanitized 503 with state/ready and optional allow-listed `failure.phase`/`failure.category`, `Retry-After: 15`, and `Cache-Control: no-store`. Both maintenance layers allow this exact GET diagnostic; the inner recovery middleware must not mask it.
- Other fenced responses use 503 with `Retry-After: 15` and `Cache-Control: no-store` without waiting for startup. API requests return JSON; browser HTML requests receive a small static maintenance page with sanitized guidance. Neither enters Nuxt's error-page SSR/local fetch or DB-backed error logging. `/__nuxt_error` stays fenced, not exempt.
- Readiness includes `guidance.message`, `guidance.action` and `guidance.recoveryRequired` when unavailable. A corrected pre-mutation failure says `fix-config-and-restart`; unresolved authority says `run-recovery-assistant`.
- Recovery exceptions remain exact GET health/readiness/restore-status paths and `/_nuxt/` static assets. Restore status keeps its existing narrow capability/authentication contract. Auth/setup and backup mutations are not prefix-exempt.
- Ownership diagnostics distinguish live/same-process ownership, existing dead writer needing offline review, remote/corrupt/unreadable records and an existing publication guard by non-secret category.

Shutdown has a **5-second coordinator deadline**, including startup, lease drain and DB disposal. Failed drain/disposal, unsettled work, an active/unfinished maintenance job or uncertainty preserves authority. A timeout is not cancellation; late boot cannot publish ready. Verified clean release removes only this writer's token/generation, never another worker's receipt.

### Development worker handoff

Installed Nitro starts a replacement worker before awaiting old close. Development therefore waits up to **5 seconds** for an existing same-host/same-PID live generation or transient publication guard to disappear through clean release, retrying acquisition at up to 50 ms intervals. Requests remain fenced while waiting. This is **not reclamation**: no receipt is adopted/deleted, and stale/remote/corrupt/recovery authority is not retried or taken over. Forced worker termination still requires offline recovery. Production does not use this development handoff wait. Run only one app process against a storage/DB target.

## 2. Ownership refusal and offline recovery

### Database outages never require recovery (2026-10-08 amendment)

This supersedes the stricter wording elsewhere in this runbook and in the backend-hardening runbook wherever they conflict.

- **Unreachable DB at boot** (refused, DNS, timeout, rejected sign-in, or a connection lost mid-boot): the process keeps its writer lock and **retries initialization in-process** with backoff (2 s doubling to 60 s). `/api/ready` returns 503 with `state: initializing`, `retry: {attempt, nextAttemptAt}` and guidance `action: wait`, `recoveryRequired: false`. The site opens by itself when the DB answers; no restart and no recovery tool. Boot work (DEFINE ... IF NOT EXISTS / OVERWRITE, marker-guarded resumable migrations) is idempotent, which is what makes the retry safe.
- **DB lost at runtime:** the dead client is dropped and requests reconnect with backoff. Closing a client now settles its stuck in-flight calls, so admission slots and leases are released (they previously leaked until `capacity exceeded`). The SurrealDB SDK's own reconnect is disabled because it replays in-flight requests after reconnecting.
- **Uncertain writes** (a write whose response was lost) persist `storage/backups/.uncertain-writes.json`. The marker is now a **10-minute quiescence window** (`UNCERTAIN_WRITE_QUIESCENCE_MS`). It refuses backup/restore jobs (`uncertain-writes-quiescing`) and is removed automatically when the window ends. It **never** blocks startup or writer release. Configure SurrealDB `--query-timeout` / `--transaction-timeout` well below 10 minutes so the window is a real execution bound.
- **Shutdown during an outage:** after a bounded drain, DB sockets are closed, which settles stuck calls, and the writer lock is released. Allow the time in Docker (`stop_grace_period: 45s`, `NITRO_SHUTDOWN_TIMEOUT=15000`).
- **Still fenced for offline review:** non-connectivity boot failures (e.g. media layout refusal, malformed migration data), restore journals and restore artifacts, and a stale `.writer.lock` left by a **killed** process (SIGKILL, OOM, power loss). The container image ships the assistant as `panda recover` (see `panda recover --help`). Run it only with the app stopped: `docker compose stop app && docker compose run --rm app panda recover`. The production compose file pins `hostname: pandablog-app` so the one-off container matches the writer lock's recorded host. See [versioning-and-cli.md](../versioning-and-cli.md#recovery-panda-recover) for hostname/PID-reuse details.

`Maintenance ownership is busy or requires offline recovery` is not proof of a harmless stale PID. Existing writer receipts deliberately cannot be reclaimed after process death: submitted DB execution can outlive the process. The former non-awaiting-plugin admission gap is fixed in source; this does not repair pre-existing receipts or authorize running the configured application.

1. Stop all application writers and prevent restarts/overlapping dev and production processes.
2. Preserve DB/media/config, receipts, journals, uncertainty markers, safety/stage artifacts and setup authority securely.
3. Independently establish DB execution quiescence; an approved DB stop/restart may be needed. Dead PID, expired timestamp, socket close and caller timeout are not proof.
4. Inspect the exact ownership generation and journal/artifact state. Verify DB/media/auth/config consistency, rehearsing on an approved isolated copy when needed.
5. Only after verification and operator approval, archive the specific completed/aborted receipts under the existing offline procedure and start exactly one writer.
6. Never delete broader storage, `setup-authority.json`, migration receipts, layout markers or safety data to make startup pass.

There is no public unfence endpoint or automatic stale-writer takeover. D-07 adds a **local repository recovery assistant**, described below; it does not connect to the DB, import dumps or resume interrupted restores.

### Repeated `Maintenance is fenced` after removing a writer lock

Deleting a disk receipt cannot reopen an already-failed coordinator in memory, and `.uncertain-writes.json` or an unfinished restore journal blocks the next boot independently of `.writer.lock`. Do not keep deleting receipts/restarting to suppress this symptom. Check `/api/ready` first. Initialization errors now report an allow-listed category such as `database-root-authentication-failed` or `database-database-authentication-failed`, without SDK causes, credentials, endpoint or SQL. Recovery on a subsequent boot reports `offline-recovery-required`; old markers do not record the original failure category.

`invalid-scoped-username` is a local configuration failure **before** writer acquisition or ROOT connection: `NUXT_SURREAL_APP_USER` must match `[A-Za-z_][A-Za-z0-9_]*` (for example `pandablog_app`, not a hyphenated name). Missing scoped credentials report `missing-scoped-credentials`. The configured scoped pair is required as input to create a missing DATABASE user; that user need not already exist when valid ROOT bootstrap is configured. Successful ROOT login cannot bypass invalid provisioning input or persisted recovery authority.

For a handshake authentication failure, verify the canonical credentials against the configured endpoint and correct authentication scope with the DB operator. ROOT bootstrap needs a ROOT identity; runtime authentication needs the configured DATABASE user in the exact namespace/database. Existing runtime users are not automatically re-passworded, and scoped failures never downgrade to ROOT. If the DB operator confirms an already-provisioned scoped user, ROOT-free startup is supported by omitting its password, but this is not a workaround for rejected scoped credentials. Correcting credentials still does not authorize clearing **pre-existing** persisted recovery authority. New verified pre-mutation failures release their own writer after cleanup, so they need only configuration correction and restart. A scoped handshake failure after ROOT has dispatched namespace/database/user provisioning is not treated as pre-mutation.

### Local recovery assistant (D-07)

From the repository root, with dependencies installed (`npm run recover` is a shortcut for `node bin/panda.mjs recover`), or in the container image as `panda recover`:

```sh
npm run recover
npm run panda -- recover --help
docker compose run --rm app panda recover   # container; stop the app first
```

Inspection is read-only, does not load `.env`, never contacts a database, and never prints owner/status tokens or record contents. `review-required` means records are eligible for **operator-reviewed** startup-only archival, not that the tool proved the failure harmless. It explains whether legacy uncertainty, dead/live/remote ownership, a restore journal or artifacts prevent restart.

If independent review confirms that the application is stopped, no old DB operations remain pending, data is consistent and a backup is preserved, use:

```sh
panda recover --archive-reviewed-startup --app-stopped --database-quiescent --data-consistent
```

This is an **expert-only** path, not a normal-user recovery workflow. The tool no longer asks users technical verification questions. Archival requires **all** `--app-stopped --database-quiescent --data-consistent` flags, supplied only by an administrator who has independently established the facts; these are operator assertions, not automatic execution/consistency proof. Never supply them solely because a PID is dead or a restore journal is absent. A plain inspection of a live writer without recovery markers reports `writer-active`, not manual recovery: check `/api/ready` before taking any action.

Archival uses the application's exclusive publication guard, rechecks unchanged receipts, and preserves only the reviewed `.writer.lock` and/or `.uncertain-writes.json` under `storage/.recovery-archive/startup-*` with a review record. It changes no DB/media/setup data. A genuinely empty, regular `.writer.lock` directory is eligible **only after the same independent review and explicit confirmations**. Missing `owner.json` does not prove abandonment; the tool cannot identify its former host/PID/generation. Emptiness is rechecked under the publication guard, and the archive's review record notes missing ownership metadata. Nonempty partial publication, corrupt/unreadable/symlinked records remain refused.

It refuses live/unprobeable/remote/nonempty-corrupt ownership, mismatched generations, unfamiliar uncertainty records, existing guards/jobs and **any** restore journal or `.restore-*` artifacts. It does not offer force deletion, automated SQL rollback or migration retries. If refused, preserve the evidence and use the offline restore runbook with the DB operator.

After successful archival, correct the configuration, start exactly one app instance and verify `/api/ready` returns 200. A partial archival failure is not permission to remove the remaining records; preserve the archive and rerun inspection.

</details>

## 3. Environment loading and canonical names

Use the same names in development and production. Nuxt development loads `.env`; an already-built standalone server does not. Supply production process environment explicitly. Compose `env_file` injection is separate from project `.env` interpolation; recreate a container after changing its environment, rather than merely restarting it.

During development/config evaluation: canonical process value, canonical local file value, then declared default. Existence matters: an explicit empty value stays empty. Deprecated aliases are not read in either development or production. Nuxt may copy file values into process environment before evaluation, making source provenance indistinguishable; canonical dominance remains enforced and tested with the actual loader. Quoting/comments/CRLF use Node's dotenv parser.

Production builds use safe non-secret private defaults, not operator secrets. Runtime startup independently validates credentials/session/origin/attribution even when a build succeeds without credentials. Only canonical prefixed process values override built private defaults; old unprefixed application names and old attribution names are ignored in every mode. Copy the root [development template](../../.env.example) to `.env` and fill in its deliberately empty required secrets, or use the [production template](../../deploy/production/.env.example) for containers.

```env
NUXT_SURREAL_URL="ws://127.0.0.1:8000/rpc"
NUXT_SURREAL_NAMESPACE="main"
NUXT_SURREAL_DATABASE="main"
NUXT_SURREAL_ROOT="root"
NUXT_SURREAL_ROOT_PASSWORD="<root-secret>"
NUXT_SURREAL_APP_USER="pandablog_app"
NUXT_SURREAL_APP_PASSWORD="<separate-runtime-secret>"
NUXT_APP_ORIGIN="http://127.0.0.1:3000"
NUXT_SESSION_PASSWORD="<32-plus-random-characters>"
# Optional dedicated MFA key; changing it affects existing encrypted secrets.
# NUXT_MFA_SECRET="<separate-mfa-secret>"
NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY=false
```

Use independently supplied local secrets/DB targets, not production secrets for development. Production origin must be an exact valid canonical origin (normally HTTPS); it is recommended locally too. DB URLs cannot contain embedded user/password credentials. Use TLS outside a trusted private boundary and keep the DB off the public Internet. Optional GeoIP uses `NUXT_GEOIP_DB_PATH`. `NODE_OPTIONS`, `LOG_CONSOLE`, `LOG_FORMAT` and independent SurrealDB service variables retain their process names.

The root template also includes `NODE_OPTIONS="--max-old-space-size=4096"`. Native Node options must be exported/injected **before launch**; Nuxt loading `.env` after launch does not resize the running heap. This example setting does not establish that the previously failed full build now passes.

`E2E_ADMIN_USERNAME` and `E2E_ADMIN_PASSWORD` remain optional Playwright application-admin credentials, not DB credentials and not account provisioning. Process overrides win, then `.env.e2e.local`, `.env.e2e`, `.env.local`, `.env` in that order. Empty values skip authenticated tests. Loader/config tests use owned fixtures; no live browser login against the user's deployment is claimed. Authenticated tests can mutate data, so use disposable targets.

Never use `NUXT_PUBLIC_` for DB/session/MFA/E2E secrets. Environment-name migration is not secret rotation; do not incidentally change session/MFA keys or invalidate existing encrypted data.

## 4. Database identities

| Runtime credentials, development or production | Result |
|---|---|
| Missing pair, partial pair, empty canonical value, invalid username shape | Configuration failure before privileged initialization |
| Both valid | DATABASE-scoped runtime sign-in, with namespace/database |
| Scoped sign-in rejected | Sanitized handshake failure; never ROOT downgrade |

Both runtime credentials are **required in every environment**, with no ROOT fallback/opt-out. User identifiers are trimmed and must start with a letter/underscore, followed by letters/digits/underscores; passwords/key material are not trimmed. Namespace/database identifiers support 1–128 characters, letter/underscore first and then letters/digits/underscore/hyphen, validated before privileged interpolation.

D-04 startup flow:

1. First run: explicitly supply ROOT bootstrap credentials with the configured scoped pair. Owned boot creates namespace/database/scoped user only.
2. Close and verify disposal of ROOT before scoped authentication. All table schemas, schema updates, required boot migrations and receipt-verified legacy access-table removal run as DATABASE EDITOR under private boot authority.
3. Keep ROOT configured when current backup/restore is required. Normal bootstrap uses `IF NOT EXISTS` for the user, preserving existing credentials/roles instead of reprovisioning on every start. Credential rotation is an explicit operation; merely changing a runtime password does not authorize automatic repair.
4. ROOT-free ordinary boot remains supported for targets where privileged maintenance is not needed: remove the password and recreate the container. Scoped authentication failure never triggers a ROOT retry. Merely restarting a container does not apply changed `env_file` values.

**Current maintenance limitation:** backup/export/import/staging/wipe/restore still uses explicit privileged clients/transports, temporary DB creation and restored-user refresh. Without ROOT these operations fail with a sanitized missing-authority error before network/privileged work; they are not silently downgraded to EDITOR. Full ROOT-free backup/restore needs separate design work. The existing restore credential-refresh invariants remain unchanged when privileged maintenance is configured.

EDITOR is a database scope reduction, not complete least privilege: actual **3.2.4+20260803.93ab219** testing runs the entire shipped 31-table schema as EDITOR while ROOT creates zero tables; user/database provisioning is denied. Configured ROOT secrets remain in process environment/config even after closing its socket, so recreate the process without them to remove that exposure. With ROOT still accessible to the process, scoped sign-in does not contain RCE. It still reduces ordinary query/SQL-injection privileges and cross-database/provisioning exposure. External privileged tooling is a separate architectural change.

Existing deployments lacking the pair must privately configure and rehearse it **before upgrading**. Rolling back an old image/config is not automatically consistent with current credentials/schema/receipt state.

## 5. Footer attribution migration

`public.footerShowPoweredBy` means “show Powered by PandaBlog with its GitHub link”; it is not payments, ads, sponsor accounts or a security control. Default false.

- Canonical: `NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY` in both environments.
- `NUXT_PUBLIC_APP_SPONSOR` and `APP_SPONSOR` are removed, not compatibility aliases. Neither has any effect in development or a built server.
- Explicit false disables attribution. Explicit empty/unsupported boolean values fail validation. Old true values cannot override the canonical setting or its default.
- Accepted case-insensitive spellings: true/false, 1/0, yes/no, on/off. Event config is normalized to the canonical boolean before Nuxt SSR/client serialization; invalid public settings do not break narrow liveness/readiness/status diagnostics.
- `NUXT_APP_SPONSOR` is not supported. The previous production sample's plain `APP_SPONSOR` was not a built-server runtime override.

D-03 explicitly removes deprecated aliases. Privately migrate old names to canonical names before upgrading; do not expect legacy-only environments to work. Rehearse owned dev/built fixtures, recreate containers/restart processes, and verify identity, footer and readiness. This does not authorize editing the user's `.env` automatically.

## 6. Verification and remaining gates

Committed tests cover actual non-awaited plugins, real production Nitro/H3 cached/local/auth routing with synthetic owned initialization, actual installed dev-worker entry/message handoff, owned clean start/stop/start and failure/recovery, actual Nuxt config/loader precedence, strict identity/boolean validation, and existing real DB privilege/restore regressions. These are not proof of the full application's Nuxt SSR/client hydration, build-watcher reload, Linux durability or deployed proxy behavior.

The full Nuxt production build hit the default heap limit during Nitro bundling; complete full/minimal/optional-module builds and full-app owned dev/production smoke remain required. Linux persistence/mounts, browser/proxy/container readiness, production-copy rehearsal and explicit operator cutover remain independent release gates. See [progress](./progress.md) for exact commands, versions, successful tiers and failed attempts.
