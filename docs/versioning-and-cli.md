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

The runtime image includes a dependency-free operator CLI at `/app/bin/panda.mjs` and linked to `/usr/local/bin/panda`.

### Usage

```bash
# Using Docker
docker exec pandablog-app panda --version
docker exec pandablog-app panda info
docker exec pandablog-app panda health

# Using Podman
podman exec pandablog-app panda --version
podman exec pandablog-app panda info
podman exec pandablog-app panda health
```

### Commands

| Command | Description |
|---|---|
| `panda version` (or `-v`, `--version`) | Output the version string (e.g., `260923-1+gedb176f`) |
| `panda info` | Output version, commit hash, commit date, Node.js version, platform, listen host/port, and storage mount writability |
| `panda health` | Send an HTTP probe to `http://127.0.0.1:$PORT/api/health`. Exits `0` for healthy (`< 500`), `1` on error/timeout |
| `panda help` | Show CLI help |

### Global Flags

- `--json`: Format output as JSON.
- `--url <url>`: Target URL for `panda health` (default: `http://127.0.0.1:$PORT/api/health`).
- `--timeout <seconds>`: Timeout for `panda health` (default: `5`).

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
