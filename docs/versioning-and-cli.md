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

The runtime image includes a single, dependency-free operator CLI at `/app/bin/panda.mjs`, linked to `/usr/local/bin/panda`. Every operator command, including the offline recovery assistant, is a `panda` subcommand; there is no separate recovery binary. `panda --help` prints the full reference, and `panda help <command>` (or `panda <command> --help`) prints detailed help for one command.

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
| `panda recover --archive-reviewed-startup --app-stopped --database-quiescent --data-consistent` | Expert-only archival of independently reviewed startup-only receipts |
| `panda help [command]` (or `-h`, `--help`) | Show the CLI overview, or detailed help for one command |

### Where each command works

| Command | `docker exec` (app up) | `docker compose run --rm app` (app down) | Dev checkout |
|---|---|---|---|
| `version` | yes | yes | yes (from git) |
| `info` | yes | yes | yes |
| `health` | yes | no: nothing listens, always FAIL | yes, against a running dev server |
| `recover` | inspection only | yes, after `docker compose stop app` | yes |

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

### Recovery (`panda recover`)

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

---

## 5. Building the Image (Docker / Podman)

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
# Build with custom Alpine image
npm run podman:build -- --build-arg NODE_IMAGE=node:22-alpine -t pandablog:alpine

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
