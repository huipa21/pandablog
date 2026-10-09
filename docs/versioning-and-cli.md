# Versioning & Container CLI (`panda`)

PandaBlog uses a deterministic, date-based, commit-pinned versioning scheme and provides an operator CLI inside the container runtime.

---

## 1. Version Format

Builds are stamped with:

```text
260923-1+gedb176f
│      │ │
│      │ └─ abbreviated 7-character commit SHA (+g...)
│      └─── 1-based index of this commit among that day's commits
└───────── committer date in YYMMDD format (pinned to UTC)
```

Example: `260923-1+gedb176f` represents the 1st commit on September 23, 2026, at commit `edb176f`.

### Inspecting Versions locally

```bash
# Print current commit's version
npm run version:print

# Machine-readable output with timestamp, sha, and sequence details
node scripts/version.mjs --json

# Check what the version was for any past commit
node scripts/version.mjs --commit c2d6a6e
```

---

## 2. Determinism Contract

**The same commit always produces the exact same version string**, on any machine, across multiple builds:

| Component | Source | Why it's deterministic |
|---|---|---|
| Date (`260923`) | Committer date of the commit | UTC-pinned, baked into the git commit object |
| Sequence (`-1`) | `git log --first-parent` | Counts only ancestors of this commit on that day; future commits cannot renumber past commits |
| Hash (`+gedb176f`) | Git commit SHA | The immutable identity of the commit |

### Hard Fail Guards

`scripts/version.mjs` deliberately aborts rather than guessing or producing inaccurate version strings:

1. **Not a git repository:** Aborts because no authentic commit/date history exists.
2. **Shallow clone:** Aborts because `fetch-depth: 1` hides ancestor commits, causing sequence numbers to undercount. In CI (e.g. GitHub Actions), configure `fetch-depth: 0`.
3. **Dirty working tree:** Aborts because uncommitted changes on disk do not match the commit hash. For local testing without committing, set `PANDA_ALLOW_DIRTY=1` to stamp `.dirty` on the version.

---

## 3. Where the Version is Stored & Exposed

Git is not included inside the container (`.git` is excluded by `.dockerignore`). The version is computed at build time and injected into 4 distinct places:

```text
                       Host: scripts/version.mjs
                                  │
                          --build-arg APP_VERSION
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
 1. /app/version.json     2. OCI Image Labels      3. Nuxt runtimeConfig
        │                         │                         │
        ▼                         ▼                         ▼
 `panda --version`        `docker/podman inspect`   Admin UI: Settings → System
 `panda info`                                       GET /api/admin/system/version
```

1. **/app/version.json:** Written during image build. Read by the `panda` CLI inside the container.
2. **OCI Labels:** `org.opencontainers.image.version`, `revision`, `created` (using the commit date) in image metadata.
3. **Nuxt Private Runtime Config:** Injected into `runtimeConfig.appVersion` by `modules/build-version.ts`.
4. **Admin UI:** Displayed in the **Settings → System** *Build* section via the protected `/api/admin/system/version` endpoint. (Not exposed on public unauthenticated endpoints to prevent version fingerprinting).

---

## 4. The Container CLI (`panda`)

The runtime image includes a single operator CLI at `/app/bin/panda.mjs`, linked to `/usr/local/bin/panda`. The dispatcher has no dependencies; `password-reset` uses separately bundled database/password code and the image's native Argon2 binding. Every operator command, including the offline recovery assistant, is a `panda` subcommand; there is no separate recovery binary. `panda --help` prints the full reference, and `panda help <command>` (or `panda <command> --help`) prints detailed help for one command.

### Usage

```bash
# App container is up
docker exec pandablog-app panda --version
docker exec pandablog-app panda info
docker exec pandablog-app panda health
podman exec pandablog-app panda info          # Podman equivalent

# App container is NOT up (failed boot, crash loop): one-off container,
# same image/.env/user/storage mount; panda replaces the server command
docker compose stop app
docker compose run --rm app panda info
docker compose run --rm app panda recover

# Development checkout
node bin/panda.mjs --help
npm run panda -- info
npm run recover                               # = panda recover
```

### Commands

| Command | Description |
|---|---|
| `panda version` (or `-v`, `--version`) | Output the version string (e.g., `260923-1+gedb176f`) |
| `panda info` | Output version, commit hash, commit date, Node.js version, platform, listen host/port, and storage mount writability |
| `panda health` | Send an HTTP probe to `http://127.0.0.1:$PORT/api/health`. Exits `0` for healthy (`< 500`), `1` on error/timeout |
| `panda recover` | Read-only offline recovery inspection of `storage/backups` (no `.env`, no DB). See [Recovery](#recovery-panda-recover) |
| Old `panda recover --archive-reviewed-startup` / assertion flags | Retired; exit 1 without filesystem changes. Ordinary restart needs no writer archival. |
| `panda password-reset <username>` | Hidden password/confirmation prompts, then updates the existing user's Argon2id hash and invalidates sessions/trusted devices. Requires an interactive terminal and DB access. |
| `panda help [command]` (or `-h`, `--help`) | Show the CLI overview, or detailed help for one command |

### Where each command works

| Command | `docker exec` (app up) | `docker compose run --rm app` (app down) | Dev checkout |
|---|---|---|---|
| `version` | yes | yes | yes (from git) |
| `info` | yes | yes | yes |
| `health` | yes | no: nothing listens, always FAIL | yes, against a running dev server |
| `recover` | inspection only | yes, after `docker compose stop app` | yes |
| `password-reset` | yes, with `-it` | yes, with DB access and a terminal | yes |

Exit codes: `0` success/healthy/inspection completed; `1` failure, unhealthy, refused recovery action or usage error.

### Global Flags

- `--json`: Format output as JSON (`version`, `info`, `health`).
- `--url <url>`: Target URL for `panda health` (default: `http://127.0.0.1:$PORT/api/health`).
- `--timeout <seconds>`: Timeout for `panda health` (default: `5`).
- `-h`, `--help`: Show help; after a command, show that command's help.

The port resolves from `NITRO_PORT`, then `PORT`, then `3000`. The default
`/api/health` probe returns `{ "ok": true, "uptime_s": 123 }` with
`Cache-Control: no-store`. It checks process liveness without rendering a page,
reading settings, authenticating, or querying the DB. It remains available in
private/restore-maintenance mode and is always excluded from access logs.

For an optional DB connectivity check, use:

```bash
panda health --url http://127.0.0.1:3000/api/health?db=1
```

The DB probe uses `RETURN 1` with a two-second overall deadline, including
connection acquisition. Failure returns HTTP 503 and `{ "ok": false, "db": "down" }`.
It is a connectivity probe, not a schema, restore-completion, or application
readiness check. No version/build information is exposed; use `panda info` for
that. The CLI's existing non-5xx-is-healthy rule is unchanged, including for
custom `--url` targets. Existing compose healthchecks that invoke `panda health`
need no change; a rebuilt image uses the new lightweight URL.

### Password reset (`panda password-reset <username>`)

```bash
docker exec -it pandablog-app panda password-reset admin
# Or, with the app stopped (from deploy/production/):
docker compose run --rm app panda password-reset admin
# Development checkout:
npm run panda -- password-reset admin
```

The command prompts `Type password:` and `Confirm password:` without echoing input. Passwords must match exactly and satisfy the existing 8–200 character policy. `Ctrl-C`/`Ctrl-D` cancels a prompt. Password arguments, pipes and non-interactive execution are refused; passwords and hashes are never printed.

A single parameterized UPDATE writes `users.password_hash`, a new `auth_epoch`, and `updated_at`. Unknown usernames fail without creating an account. Existing sessions and trusted devices are invalidated; role, active status and MFA configuration remain unchanged. Disabled accounts remain disabled.

Only this subcommand reads app-root `.env` configuration (inherited process environment wins). It uses `NUXT_SURREAL_URL`, `NUXT_SURREAL_NAMESPACE`, `NUXT_SURREAL_DATABASE`, `NUXT_SURREAL_APP_USER` and `NUXT_SURREAL_APP_PASSWORD`. Endpoint/namespace/database defaults match the app's local defaults. ROOT credentials are never used and the web server need not be running.

Use the app's **same storage mount and database target**. The command participates in the persisted maintenance job mutex, refusing overlap with backup/restore/import jobs and unresolved restore recovery. Lost database responses are not retried automatically; an uncertain-write marker protects subsequent destructive maintenance. Verify sign-in before retrying an uncertain reset. Never delete recovery records to force a reset.

The Dockerfile bundles `scripts/password-reset.ts` separately to `.output/server/password-reset.cjs`, beside the native Argon2 runtime dependency. Development checkouts use the installed `tsx` loader. Neither path imports Nitro internals. Rebuild the runtime image to ship the new command.

### Recovery (`panda recover`)

> **Current working-tree CLI:** restore-oriented read-only inspection; exact evidence and outstanding build/release gates are in [maintenance progress](maintenance-simplification/progress.md). Old images retain the historical CLI. Rebuild and complete acceptance before deployment; never delete restore/domain receipts to make an upgrade start.

`panda recover` neither loads `.env` nor contacts DB/Nitro/SQL; inspection changes nothing and never prints owner/status tokens. Development (`tsx`) and bundled (`recover.cjs`) paths match. Use `/api/ready` to distinguish initialization/config/DB problems from actual restore recovery.

| Result | Current meaning |
|---|---|
| `clear` | No destructive restore blocker. Retired writer/guard objects, nonrestore jobs, finite uncertainty, trustworthy pre-destructive and verified terminal journals are informational. |
| `manual-recovery-required` | Destructive/ambiguous restore, contradictory paths/terminal state, unmatched swap artifacts or legacy restore-kind file evidence. Preserve paired safety/journal/media; follow the [restore runbook](maintenance-simplification/operations.md#6-actual-interrupted-destructive-restore). |

`writer-active` and `review-required` are retired; their ordinary writer-only cases map to `clear`. `canArchiveReviewedStartup` remains in the report but is always false. Plain inspection exits **0**, including a reported restore blocker; invalid invocation/unsafe paths exit **1**. All old `--archive-reviewed-startup`, `--app-stopped`, `--database-quiescent`, `--data-consistent` flags are refused before I/O, regardless of supplied assertions.

No fixed hostname or PID interpretation is needed for ordinary restart. Keep one app instance, stop/remove before replacement. Backup/reset job exclusion still refuses live/PID-reused/remote ownership; recognized dead-local owners can be reclaimed after a finite hold. Unknown/partial/remote nonrestore records restrict jobs only. A narrow operator job-only remedy requires stopping all app/CLI jobs and preserving the exact record, not certifying DB consistency to clear an application owner.

New app processes delay backup-family jobs for ten minutes to cover execution after a crash before uncertainty persistence. An observed abandoned job/reset gets an exact-generation ten-minute hold before takeover. Configure separate DB query/transaction timeouts below this bound. Recent/invalid uncertainty is job-only; expiry is automatic and the informational file remains unchanged to avoid deleting a newer CLI publication. Normal boot/traffic remains available. Password reset still uses scoped credentials, hidden input, existing-user-only update/new epoch and no ambiguous-write replay.

<details>
<summary>Historical startup-archival CLI (old images only; superseded)</summary>

The offline startup-recovery assistant (source: `scripts/recover.ts` + `scripts/recovery/assistant.ts`) is bundled at image build time to `/app/bin/recover.cjs`; `panda recover` runs it as a child process with `/app` as the working directory and exits with its exit code. In a dev checkout `panda recover` runs `scripts/recover.ts` through the installed `tsx` loader.

Use it when `/api/ready` reports guidance `run-recovery-assistant` or the boot log says the service "remains fenced; run panda recover for guidance". It is **not** needed for an unreachable database (the app retries and opens by itself) or for invalid configuration / rejected pre-mutation sign-in (fix `.env`, recreate the container).

```bash
docker compose stop app                     # never inspect-and-archive next to a running app
docker compose run --rm app panda recover   # read-only inspection
```

| Result | Meaning |
|---|---|
| `clear` | No persisted recovery blocker. Check `/api/ready` and the logs for configuration errors. |
| `writer-active` | The recorded writer process is running. Normal; no recovery action indicated. |
| `review-required` | Startup-only receipts (e.g. a writer lock left by a killed process) need evidence the tool cannot establish. Expert-reviewed archival is available. |
| `manual-recovery-required` | Restore journal/artifacts, maintenance job, ownership from another host, or corrupt records. Nothing changed; follow the [offline recovery runbook](backend-hardening/operations.md#offline-recovery-no-public-unfence-endpoint). |

Expert-only archival moves the reviewed `.writer.lock` (and any `.uncertain-writes.json`) into `storage/.recovery-archive/startup-*` with a review record; no DB, media or setup data is modified:

```bash
docker compose run --rm app panda recover --archive-reviewed-startup --app-stopped --database-quiescent --data-consistent
```

All three assertion flags are required and are operator assertions, not checks. Never pass one for a fact you have not independently established.

**Hostname and PID reuse.** The writer lock records `hostname()` and `pid`. `deploy/production/docker-compose.yml` sets a fixed `hostname: pandablog-app`, so a one-off `docker compose run` container has the same hostname as the app container. Without a fixed hostname (default Docker behavior), a lock written by the app is reported as *another host* and archival is refused, though inspection still works. For plain `docker run`, pass `--hostname`.

PID numbering restarts in every container, so the one-off `panda` process usually gets the PID the app's server had. The assistant therefore never treats its own PID or its parent's PID as the recorded writer. Instead it reports "the recorded writer PID now belongs to this recovery tool" and continues to `review-required`. Neither this nor a dead PID proves anything about other containers: a one-off container cannot see the app container's processes. The app **must** be stopped (`docker compose stop app`) before archival, and only one app instance may use a storage/DB target.

The fixed hostname does not let the app take over a stale lock. On boot, `startWriter` never reclaims an existing `.writer.lock`: a same-host lock is refused (`owner-offline-review` / `owner-live-same-process`), just as a different-host lock is (`owner-remote`).

</details>

---

## 5. Building the Image (Docker / Podman)

Both Dockerfile stages always use `node:22-alpine`; alternate base images are not supported.
Because `.git` is ignored in `.dockerignore`, container builds must receive `APP_VERSION` as a build argument.

### Automated Build (Recommended)

The build script auto-detects `docker` or `podman`:

```bash
# Auto-detects docker or podman
npm run container:build

# Specifically target Docker or Podman
npm run docker:build
npm run podman:build
```

Pass extra flags after `--`:
```bash
# Custom tag using Podman (the base is always Alpine)
npm run podman:build -- -t pandablog:custom

# Custom registry tag
npm run container:build -- -t ghcr.io/myorg/pandablog:latest
```

### Manual Build Command

```bash
# Docker
docker build \
  --build-arg APP_VERSION="$(node scripts/version.mjs)" \
  --build-arg APP_COMMIT="$(git rev-parse HEAD)" \
  --build-arg APP_COMMIT_DATE="$(git show -s --date=iso-strict-local --format=%cd HEAD)" \
  -t pandablog:latest .

# Podman
podman build \
  --build-arg APP_VERSION="$(node scripts/version.mjs)" \
  --build-arg APP_COMMIT="$(git rev-parse HEAD)" \
  --build-arg APP_COMMIT_DATE="$(git show -s --date=iso-strict-local --format=%cd HEAD)" \
  -t pandablog:latest .
```
