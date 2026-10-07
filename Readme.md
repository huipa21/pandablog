# PandaBlog

PandaBlog is a self-hosted, single-author blogging platform built on Nuxt. It pairs a fast,
server-rendered public site with a rich, block-based admin workspace for writing posts,
managing media, and configuring your site — all backed by SurrealDB.

- **Public site**: SSR blog with posts, categories, tags, full-text search (including CJK),
  a relationship graph, and a publish-activity heatmap.
- **Admin workspace**: a Tiptap-based WYSIWYG editor with many content blocks, a hash-based
  media library, analytics, logging, backups, post versioning, themes, and multi-user roles.
- **Modular**: optional features can be compiled in or out per deployment.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [First-run setup](#first-run-setup)
- [Available scripts](#available-scripts)
- [Versioning & the `panda` CLI](#versioning--the-panda-cli)
- [Optional features (modules)](#optional-features-modules)
- [Content blocks](#content-blocks)
- [Media library](#media-library)
- [Backups](#backups)
- [Themes](#themes)
- [Visibility & access control](#visibility--access-control)
- [Security & reverse proxy](#security--reverse-proxy)
- [Deploying with Docker](#deploying-with-docker)
- [Testing](#testing)
- [Project layout](#project-layout)
- [How it works](#how-it-works)

---

## Features

- **Block editor** — headings, lists, quotes, tables, code blocks with syntax highlighting,
  Mermaid diagrams, KaTeX math, image/media-text blocks, columns, tabs, accordions, diffs,
  footnotes, annotations, custom HTML, video embeds, and more.
- **WYSIWYG parity** — what you see in the editor matches the published post exactly.
- **Media library** — drag-and-drop uploads, SHA-256 deduplication, automatic WebP variants,
  folders, tags, search, and orphan cleanup.
- **Full-text search** — multilingual search across titles, summaries, and body content, with
  dedicated tokenization for English plus Simplified/Traditional Chinese and Japanese.
- **Relationship graph** — explore posts by category, tag, and explicit post-to-post links.
- **Post versioning** — automatic content snapshots with diff and restore.
- **Analytics** — pageview/session metrics with optional city-level GeoIP lookups.
- **Logging** — configurable access, activity, and error logs with export and retention tools.
- **Backups** — full and incremental snapshots of the database and media, with import/export.
- **Themes** — uploadable, validated themes with light/dark design tokens.
- **Multi-user roles** — superadmin, admin, author, and viewer roles.
- **Two-factor authentication** — per-account TOTP, with optional admin enforcement.
- **Internationalized UI** — English and Simplified Chinese out of the box.

---

## Tech stack

- [Nuxt 4](https://nuxt.com/) + Vue 3 + TypeScript, with Nitro server routes
- [Nuxt UI](https://ui.nuxt.com/), Tailwind CSS, Nuxt Icon, Nuxt Image, Nuxt Fonts
- [Pinia](https://pinia.vuejs.org/) for client state
- [SurrealDB](https://surrealdb.com/) 3.x for data, full-text indexes, and graph relations
- [`nuxt-auth-utils`](https://github.com/atinux/nuxt-auth-utils) for encrypted session cookies
- [Tiptap v2](https://tiptap.dev/) for the admin editor
- [Shiki](https://shiki.style/) for public code highlighting, [Mermaid](https://mermaid.js.org/)
  for diagrams, [KaTeX](https://katex.org/) for math
- [`sharp`](https://sharp.pixelplumbing.com/) for image processing, [`argon2`](https://github.com/ranisalt/node-argon2)
  for password hashing, [`otplib`](https://github.com/yeojz/otplib) for TOTP
- `@nuxtjs/i18n` for translations

---

## Requirements

- **Node.js 22+** (recommended)
- **npm**
- A reachable **SurrealDB 3.x** instance (local or remote, over a WebSocket endpoint)

---

## Quick start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start SurrealDB** (skip if you already have a reachable instance). For example, with Docker:

   ```bash
   docker run --rm -p 8000:8000 surrealdb/surrealdb:latest \
     start --user root --pass "your-local-password"
   ```

3. **Copy the [development environment template](.env.example)** and fill in the required secrets (see [Environment variables](#environment-variables)):

   ```bash
   cp .env.example .env
   ```

4. **Run the dev server**

   ```bash
   npm run dev
   ```

5. **Open the app**

   - Public site: <http://127.0.0.1:3000/>
   - Admin login: <http://127.0.0.1:3000/admin/login>

On first launch, visit `/admin` and complete the [first-run setup](#first-run-setup).

---

## Environment variables

Use the same canonical `NUXT_` names in development and production. Development loads
`.env`; the standalone built server does not, so supply process environment (Compose
`env_file` injects it). Canonical process values win over canonical file values, then
declared defaults. Explicit empty values stay empty. Nuxt may copy file values into process
environment before config evaluation, so source provenance can be indistinguishable.

**Deprecated aliases are not supported**, in either environment. Migrate old unprefixed
application variables to the canonical names below, and replace `APP_SPONSOR` /
`NUXT_PUBLIC_APP_SPONSOR` with `NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY` before upgrading.
Boolean values accept true/false, 1/0, yes/no and on/off; empty or unsupported values reject
startup. Production builds use empty private defaults rather than embedding operator secrets.

### Minimal `.env` for local development

Start with the root [.env.example](.env.example). Its required secret fields are deliberately
empty: set local ROOT/runtime passwords and a generated session key before starting.

```env
# SurrealDB connection
NUXT_SURREAL_URL="ws://127.0.0.1:8000/rpc"
NUXT_SURREAL_NAMESPACE="main"
NUXT_SURREAL_DATABASE="main"
NUXT_SURREAL_ROOT="root"
NUXT_SURREAL_ROOT_PASSWORD="<local-root-secret>"
NUXT_SURREAL_APP_USER="pandablog_app"
NUXT_SURREAL_APP_PASSWORD="<separate-local-runtime-secret>"
NUXT_APP_ORIGIN="http://127.0.0.1:3000"
NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY=false

# Session cookie encryption — MUST be 32+ random characters.
# Generate one with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
NUXT_SESSION_PASSWORD="replace-with-a-32-plus-character-random-string"
```

### Reference

| Variable | Purpose | Required |
| --- | --- | --- |
| `NUXT_SURREAL_URL` | SurrealDB WebSocket RPC endpoint | Yes |
| `NUXT_SURREAL_NAMESPACE` | Database namespace | Yes |
| `NUXT_SURREAL_DATABASE` | Database name | Yes |
| `NUXT_SURREAL_ROOT` | ROOT bootstrap user for namespace/database/scoped-user provisioning | First run; optional afterward |
| `NUXT_SURREAL_ROOT_PASSWORD` | ROOT bootstrap password; remove after provisioning for ROOT-free normal startup | First run; also needed by current privileged backup/restore |
| `NUXT_APP_ORIGIN` | Exact canonical browser origin | Production; recommended locally |
| `NUXT_SESSION_PASSWORD` | 32+ character random string for session cookie encryption. Production refuses to start without it. | Yes |
| `NUXT_SURREAL_APP_USER` | Required DATABASE-scoped EDITOR runtime user (see [Scoped database user](#scoped-database-user)) | Yes, dev and production |
| `NUXT_SURREAL_APP_PASSWORD` | Separate runtime password; no ROOT fallback | Yes, dev and production |
| `NUXT_MFA_SECRET` | Optional dedicated TOTP encryption key; falls back to `NUXT_SESSION_PASSWORD` | No |
| `NUXT_GEOIP_DB_PATH` | Path to a MaxMind-compatible `.mmdb` file | No |
| `NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY` | Show “Powered by PandaBlog” GitHub attribution; default false | No |
| `NODE_OPTIONS` | Node process options; root example sets `--max-old-space-size=4096` | No |
| `E2E_ADMIN_USERNAME` | Existing app-admin username for authenticated Playwright tests | Tests only |
| `E2E_ADMIN_PASSWORD` | App-admin password for Playwright; not a database password | Tests only |

`NODE_OPTIONS` is a native process setting, not Nuxt runtime config. Export it in the
launching shell or inject it into the container before Node starts; loading a `.env` after
launch does not resize the current process heap.

> **Note on production / Docker:** when running the built server, Nitro only overrides runtime
> config from `NUXT_`-prefixed variables (for example `NUXT_SURREAL_URL`,
> `NUXT_SURREAL_ROOT_PASSWORD`, `NUXT_MFA_SECRET`). A ready-to-edit production template lives at
> [deploy/production/.env.example](deploy/production/.env.example).

### Optional analytics GeoIP database

City-level analytics use a local MaxMind-compatible `.mmdb` file (not a database table). Download
a city-level database in MMDB format and place it at:

```text
storage/geoip/dbip-city-lite.mmdb
```

To use a different location, set `NUXT_GEOIP_DB_PATH` in either environment. Until a
database is present, the Analytics page shows a "GeoIP database not loaded" notice and the world
map is empty.

---

## First-run setup

The admin username is always `admin`. The password is **not** stored in an environment variable —
on a fresh database, open `/admin` and complete the setup wizard. Your password is hashed with
argon2id and stored in SurrealDB. You can change it later from **Admin → Settings → Profile**.

---

## Available scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Nuxt development server |
| `npm run build` | Build the production server |
| `npm run preview` | Preview the production build locally |
| `npm run generate` | Generate static output |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Lint code and check for style drift |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run lint:css` | Lint CSS and Vue styles |
| `npm run format` | Format the codebase with Prettier |
| `npm run test:unit` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run end-to-end tests (Playwright) |
| `npm run configure` | Interactively select optional modules |
| `npm run modules:print` | Print the normalized module manifest |
| `npm run hash-password` | Generate an argon2 password hash |
| `npm run version:print` | Print the build version for the current commit |
| `npm run container:build` | Build container image (auto-detects Docker / Podman) |
| `npm run docker:build` | Build container image with Docker |
| `npm run podman:build` | Build container image with Podman |

---

## Versioning & the `panda` CLI

PandaBlog uses a deterministic, date-based versioning scheme (`YYMMDD-N+g<sha>`, e.g. `260923-1+gedb176f`) and ships a lightweight operator CLI `panda` inside the runtime image.

Quick commands:

```bash
# Print version for the current commit
npm run version:print

# Build the container image (auto-detects Docker or Podman)
npm run container:build

# Inspect inside the container
docker exec pandablog-app panda --version   # or: podman exec pandablog-app panda --version
docker exec pandablog-app panda info
docker exec pandablog-app panda health
```

See [docs/versioning-and-cli.md](docs/versioning-and-cli.md) for full documentation on the version format, determinism guarantees, OCI labels, admin API, and CLI reference.

---

## Optional features (modules)

PandaBlog can compile optional features in or out via
[pandablog.modules.json](pandablog.modules.json). Edit the manifest directly, or run the
interactive configurator:

```bash
npm run configure
```

To print the normalized manifest (useful for CI or deployment checks):

```bash
npm run modules:print
```

Available modules:

| Module | What it controls |
| --- | --- |
| `editor` | The admin editor and individual content block types |
| `logs` | Access, activity, and error logging surfaces |
| `analytics` | Pageview/session analytics and optional GeoIP lookups |
| `users` | Multi-user roles and user management |
| `themes` | Theme management and bundled non-default themes (the default theme always remains) |
| `mfa` | TOTP setup, challenge, and optional admin MFA enforcement |
| `securityAlerts` | Security alerting surfaces |
| `backups` | Backup/restore APIs, admin UI, and storage |
| `graphView` | Public relationship graph widgets and projection APIs |
| `publishActivityHeatmap` | The public publish-activity heatmap and its endpoint |
| `postVersioning` | Post history, diff/restore, and historical block snapshots |

**How it works:** at startup, [modules/feature-flags.ts](modules/feature-flags.ts) reads the
manifest, exposes the normalized settings via runtime config, and injects build constants.
Disabled modules are excluded from the build where the app has a clean boundary, and the
SurrealDB schema is module-aware — disabled `logs`, `analytics`, and `backups` modules don't
create their optional tables on a fresh install.

> Module selections are baked in at **build time**. When deploying with Docker, update the
> manifest **before** building the image; runtime environment variables cannot turn modules on
> or off afterward.

> When `mfa.enabled` is `false`, MFA is bypassed at login (password-only). This avoids lockouts
> but lowers authentication strength — only disable it when that trade-off is intentional.

---

## Content blocks

The admin editor is built on Tiptap and renders the same DOM the public site shows. Supported
blocks include:

- Headings, paragraphs, bold/italic/strike, highlight, links
- Bullet, ordered, and nested lists
- Blockquotes and separators
- Code blocks with language selection (highlighted with Shiki on the public site)
- Tables
- Images and media-text blocks (via the media picker, paste, or drag-and-drop)
- Columns, tabs, and accordions
- Diff blocks, footnotes, and annotations
- Mermaid diagrams and KaTeX math (inline and block)
- Custom HTML, video embeds, and related-post blocks

Unknown nodes degrade gracefully so older posts keep rendering after editor schema changes.

---

## Media library

The media library lives at `/admin/media`. Files are hashed with SHA-256 and stored in
year/month folders, with WebP variants generated for images:

```text
storage/uploads/YYYY/MM/<hash>.<ext>
storage/variants/thumbnail/YYYY/MM/<hash>.webp
storage/variants/medium/YYYY/MM/<hash>.webp
storage/variants/large/YYYY/MM/<hash>.webp
```

- **Deduplication** — uploading the same bytes reuses the existing record and increments its
  reference count.
- **Serving** — originals are served from `/api/media/file/<hash>` and variants from
  `/api/media/variant/<size>/<hash>` with immutable cache headers.
- **Organization** — combine filters for name/comment text, upload date, type/MIME, custom
  folder, tag, and orphan state. Virtual month folders are derived from upload dates and never
  affect disk layout.
- **Orphans** — files with no references can be listed and cleaned up (database record plus
  physical files) from the admin UI, which requires confirmation. Optional scheduled cleanup is
  configurable under **Admin → Settings → Media**.

---

## Backups

**Admin → Tools → Backups** (superadmin only) provides manual snapshot management. Each snapshot
is stored under `storage/backups/<id>/`:

```text
db.surql.gz     Gzipped SurrealDB export (full database)
media.tar.gz    Gzipped tar of media originals (full or incremental set)
manifest.json   SHA-256 hashes + metadata for integrity verification
```

- **Full** — entire database plus all current media files.
- **Incremental** — a fresh full database dump plus only media files added since the parent
  snapshot. Incrementals form a chain; restore walks the chain oldest-first to reconstruct the
  full media set.
- **Restore is replace-only** — the database is wiped and reimported, variants are cleared, then
  each chain ancestor's media is extracted (idempotent by hash filename). Image variants are
  regenerated in the background afterward.
- **Export / Import** — download a snapshot's archives and import them on another instance to
  register a new restorable snapshot. An optional `manifest.json` enables integrity verification.

> Backups are manual (no scheduling) and have no automatic retention policy — delete old
> snapshots from the UI. Only one backup job runs at a time per server process.

---

## Themes

The public site uses an uploadable theme system. Themes live in `themes/<id>/`:

```text
themes/my-theme/
├── theme.json      # manifest (required)
├── tokens.json     # design tokens for light + dark (required)
├── theme.css       # CSS overrides (required)
└── preview.png     # preview thumbnail (required)
```

See `themes/default/` for a reference implementation. Tokens are split into `light` and `dark`
sets and exposed as CSS custom properties (for example `color.bg` → `--color-bg`).

**Uploading:** zip your theme folder, then go to **Admin → Settings → Themes → Upload .zip**.
Uploads must be ≤5 MB and pass validation (no path traversal, allowed extensions only, valid
manifest, and CSS free of `@import`, `javascript:`, or `expression()`). After upload, preview the
theme and then activate it.

---

## Visibility & access control

PandaBlog has two independent visibility layers.

### Site-wide

Set under **Admin → Settings → Visibility**:

- **Public** (default) — anyone can browse; per-post rules still apply.
- **Private** — anonymous visitors are redirected to login; only the admin can browse.

If SurrealDB is unreachable while reading this setting, the site defaults to **public**
(fail-open) so a database outage can't lock everyone out.

### Per-post

Set on each post in the editor:

- **Public** — visible to anyone (default).
- **Private** — hidden from non-admins; returns 404 to anonymous visitors and is excluded from
  public lists.
- **Password protected** — listed publicly, but the body is gated behind a password. A correct
  entry sets a signed cookie so the post stays unlocked on later visits. Passwords are stored as
  argon2id hashes and unlock attempts are rate-limited.

The logged-in admin always sees everything, regardless of either layer.

---

## Security & reverse proxy

PandaBlog is designed to run behind a TLS-terminating reverse proxy (nginx, Caddy, Traefik, or
Cloudflare). In production it emits HSTS and other security headers, and session cookies are set
`Secure` — so the admin area must be served over HTTPS.

### Client IP and `trust_proxy_headers`

The app derives each request's client IP from `X-Forwarded-For` when the `trust_proxy_headers`
setting is enabled (default). This IP drives login rate limiting and lockout, public rate limits,
password-unlock throttling, and access logs/geo lookups.

> **Important:** only keep `trust_proxy_headers` enabled when a **trusted** reverse proxy sits in
> front of the app and **overwrites** `X-Forwarded-For` with the real client IP. If the app is
> exposed directly to the internet, set it to `false` — otherwise clients can spoof the header to
> forge their IP and bypass rate limiting.

Example nginx configuration that sets a trustworthy forwarded IP (overwrite, do not append):

```nginx
location / {
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host              $host;
    proxy_pass http://127.0.0.1:3000;
}
```

### Scoped database user

Development and production both require a DATABASE-scoped `EDITOR` runtime user.
ROOT bootstrap creates only the namespace, database and scoped user. All table schemas,
boot migrations and ordinary queries use the scoped identity. Set both:

```env
NUXT_SURREAL_APP_USER="pandablog_app"   # starts with a letter/_; then letters/digits/_
NUXT_SURREAL_APP_PASSWORD="<separate-runtime-secret>"
```

On first run, supply `NUXT_SURREAL_ROOT` / `NUXT_SURREAL_ROOT_PASSWORD`. Owned startup
explicitly provisions the namespace/database and scoped user, then closes ROOT **before**
scoped sign-in and schema/migrations. Normal bootstrap creates a **missing** scoped user but
does not overwrite an existing user's password or roles. Keep ROOT configured if using current
backup/restore. ROOT-free ordinary startup remains possible by removing its password and
recreating the app container, but this is not a full-feature maintenance configuration.

Missing, partial or invalid scoped credentials fence startup before privileged effects;
failed scoped authentication never retries as ROOT. With ROOT removed, changing scoped
credentials requires separate approved provisioning rather than automatic password repair.
Namespace/database names use supported 1–128 character identifiers (letters/underscore first,
then letters/digits/underscore/hyphen). Development follows the same policy, not the same
production passwords or DB target.

**Maintenance caveat:** the current backup/export/import/staging/restore implementation still
requires explicit ROOT credentials, including temporary database creation and user refresh.
These operations fail clearly when ROOT is absent; they are not silently run as EDITOR.
A completely ROOT-free backup/restore design is separate work. The scoped EDITOR remains useful
for limiting ordinary query/SQL-injection impact to the selected database and denying user or
database provisioning, although it has broad table/data privileges there. It does **not** contain
process compromise while that process has access to ROOT secrets. Keeping a scoped query client
is defense in depth, not a claim that ROOT secrets in the same process are inaccessible.

Startup stays fenced until ownership and mandatory initialization complete. `/api/health`
is liveness only; `/api/ready` returns 200 only when ready (503 during startup, failure,
maintenance or shutdown). Invalid configuration and verified pre-mutation connection/sign-in
failures need only correction and restart: after verified client cleanup, the app releases its
own writer and creates no recovery marker. Partial initialization, uncertain writes and
interrupted restores remain fenced. Existing legacy markers are never silently cleared.
Browser requests show a static maintenance explanation instead of an error-rendering loop.

For recovery guidance, run `npm run recover` from the repository root (read-only; no database
connection). After independently verifying stopped app writers, database quiescence, consistent
data and a preserved backup, an administrator can use the expert-only archival flags shown by
`npm run recover -- --help`. Normal inspection asks no technical verification questions and
reports live ownership without recovery markers as normal, not a manual recovery problem. It refuses interrupted restores and unsafe ownership; there is
no public unfence endpoint or automatic stale-writer takeover. See the
[runtime startup operations](docs/runtime-startup-config/operations.md) for prerequisites.
Compose environment changes require container recreation, not merely restart.

### Two-factor authentication

Each account can enable TOTP from **Admin → Settings → Security**. Superadmins can require MFA for
all administrators, forcing enrollment at next sign-in.

TOTP secrets are encrypted at rest (AES-256-GCM). The key is derived from `NUXT_MFA_SECRET` when set,
otherwise from `NUXT_SESSION_PASSWORD`.

> Rotating the MFA key (or the session password when no dedicated MFA key is set) **invalidates
> all stored TOTP secrets** — affected users must re-enroll. Backup codes are hashed (not
> encrypted) and are unaffected. Database backups include the encrypted secrets, so a restore only
> works with the matching key.

---

## Deploying with Docker

A production-ready `Dockerfile` and Compose setup are included.

1. **Select modules** in [pandablog.modules.json](pandablog.modules.json) (they are baked in at
   build time).

2. **Build the image** from the project root:

   ```bash
   # Auto-detects Docker or Podman
   npm run container:build

   # Or explicitly choose engine:
   npm run docker:build
   npm run podman:build
   ```

   This computes the build version from git and passes it in, tagging the result as both
   `pandablog:<version>` and `pandablog:latest`. Extra arguments are forwarded to the container engine.

   See [docs/versioning-and-cli.md](docs/versioning-and-cli.md) for details.

   The default base image is `node:22-bookworm-slim` for native-module compatibility. To
   experiment with a smaller image, build from Alpine:

   ```bash
   npm run container:build -- --build-arg NODE_IMAGE=node:22-alpine -t pandablog:alpine
   ```

   Only promote the Alpine image after smoke-testing login, image upload/variant generation,
   backups, and public post rendering — native modules such as `sharp` and `argon2` are compiled
   for the selected base image.

3. **Configure runtime env.** Nuxt runtime configuration uses `NUXT_`-prefixed variables;
   `NODE_OPTIONS`, `LOG_CONSOLE`, and `LOG_FORMAT` use their plain names. Copy the template
   and fill in real values:

   ```bash
   cp deploy/production/.env.example deploy/production/.env
   ```

4. **Run** with the provided Compose file:

   ```bash
   docker compose -f deploy/production/docker-compose.yml up -d
   ```

   Or run the image directly behind your own proxy:

   ```bash
   docker run -d \
     --name pandablog \
     -p 127.0.0.1:3000:3000 \
     --env-file deploy/production/.env \
     --log-driver json-file --log-opt max-size=10m --log-opt max-file=5 \
     -v pandablog-storage:/app/storage \
     pandablog:latest
   ```

Notes:

- Verify what actually shipped after deploying:

  ```bash
  docker exec pandablog-app panda info
  docker inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' pandablog:latest
  ```

- Keep real secrets in the runtime `.env`; never bake them into the image.
- Bind-mount or use a volume for `/app/storage` so uploads, variants, backups, and the GeoIP
  database persist across restarts.
- First deployment still requires opening `/admin` once to complete setup.

### Backend hardening release handoff

Backend hardening is **not release-approved**: Phase 4 prerequisites and combined/operator
acceptance remain incomplete. Read the [progress ledger](docs/backend-hardening/progress.md),
[draft recovery/deployment runbook](docs/backend-hardening/operations.md), and
[Phase 5 evidence matrix](docs/backend-hardening/release-handoff.md) before planning an upgrade.
`npm run release:report` is read-only; `npm run release:check:local` and `npm run release:check`
fail when required implementation/evidence is missing. They do not run tests or authorize deployment.

### Container logging

See the [logging operations runbook](docs/logging/operations.md) for access-file inspection,
error triage, retention, backups, migration/rollback safeguards, and troubleshooting.

The production env template sets `LOG_CONSOLE=errors` and `LOG_FORMAT=json`. These are
read at process startup, without a `NUXT_` prefix:

| Variable | Values and behavior | Default |
|---|---|---|
| `LOG_CONSOLE` | `off`: silence the logging subsystem; `errors`: errors/warnings to stderr; `all`: also access/activity to stdout (info/debug still respect log-level/debug settings) | `errors` |
| `LOG_FORMAT` | `json`: one JSON object per line, with escaped stack newlines; `pretty`: human-readable output | `json` when `NODE_ENV=production`, otherwise `pretty` |

The admin `console_output` toggle upgrades `errors` to `all` live, but cannot override `off`.
Console output is independent of DB storage switches; access exclusions/sampling and the
Nitro error-status threshold still apply. These controls do not silence unrelated `console.*`
calls outside the logging subsystem. Invalid env values fall back to the defaults with a warning.

Compose uses Docker's `json-file` driver, rotating at **10 MB per file** and retaining **5 files**
(about 50 MB per app container). This covers stdout/stderr only, not DB or `/app/storage` logs;
oldest Docker logs are discarded on rotation. Recreate the app after changing the env file or
logging options; `docker compose restart` alone does not apply them:

```bash
docker compose -f deploy/production/docker-compose.yml up -d --force-recreate app
docker inspect --format '{{json .HostConfig.LogConfig}}' pandablog-app
```

Inspect should report `json-file` with `max-size: "10m"` and `max-file: "5"`. To read errors
(requires host `jq`) or correlate a request, merge stderr and stdout and filter the JSON lines:

```bash
docker logs pandablog-app 2>&1 | grep '"kind":"error_log"' | jq .
docker logs pandablog-app 2>&1 | grep -F '<request-id>'
```

Replace `<request-id>` with the actual ID. For the direct `docker run` example, use the container
name `pandablog` instead. The JSON error filter requires `LOG_FORMAT=json`.

---

## Testing

**Unit tests** (Vitest):

```bash
npm run test:unit
```

**End-to-end tests** (Playwright):

```bash
npm run test:e2e
```

The e2e suite starts the dev server automatically unless `PLAYWRIGHT_BASE_URL` is set (point it at
an already-running instance to test that instead). Admin credentials for the suite are read from
process environment or `.env` via `E2E_ADMIN_USERNAME` and `E2E_ADMIN_PASSWORD`. These are
existing **application admin** credentials, not ROOT/scoped database credentials; the test
settings do not create an admin account. Empty credentials skip authenticated tests.
Playwright loads process overrides first, then `.env.e2e.local`, `.env.e2e`, `.env.local`, and
`.env` (first defined value wins). The root `.env.example` includes both optional keys.
Use a disposable test deployment; authenticated tests can create/delete application data.
Authenticated development E2E specs use those two E2E names only, without alternate login-name
fallbacks. Anonymous public and explicitly mocked UI tests intentionally need no account;
user-management cases generate credentials for their own test-created users. Unit/DB integration
suites use independent owned fixture credentials, never the development E2E account.

---

## Project layout

```text
app.vue, app.config.ts             App root and runtime app config
nuxt.config.ts                     Nuxt configuration and runtime config
pandablog.modules.json             Optional-module manifest
assets/css/main.css                Global Tailwind and content styles
components/admin/                   Admin UI: editor, media, settings
components/admin/editor/            Tiptap Vue node views (editor side)
components/content/                 Public Tiptap JSON renderers (reader side)
components/post/, components/blog/  Public post and listing components
extensions/                        Custom Tiptap nodes and editor commands
composables/                       Shared Vue composables
layouts/admin.vue, default.vue     Admin shell and public shell
middleware/admin.global.ts         Client-side admin route guard
pages/admin/                       Admin login, dashboard, posts, settings, etc.
pages/blog/[slug].vue              Public post page
pages/                             Home, search, graph, category, tag pages
server/api/                        Nitro API endpoints (public + admin)
server/plugins/db-init.ts          SurrealDB schema bootstrap and migrations
server/utils/                      DB, auth, content, and helper utilities
server/utils/schema.surql          SurrealDB schema definition
themes/                            Bundled and uploaded themes
bin/panda.mjs                      Operator CLI shipped in the container
scripts/version.mjs                Build version generator (date + commit)
modules/build-version.ts           Injects the version into runtimeConfig
i18n/locales/                      UI translations (en, zh-CN)
tests/unit, tests/e2e              Unit and end-to-end tests
deploy/production/                 Production Dockerfile env, Compose, nginx
```

---

## How it works

### Runtime flow

1. Nuxt starts and [server/plugins/db-init.ts](server/plugins/db-init.ts) connects to SurrealDB.
2. The schema in [server/utils/schema.surql](server/utils/schema.surql) is applied (module-aware),
   followed by any data migrations.
3. Public pages call cached Nitro endpoints; admin pages call protected endpoints under
   `server/api/admin`.
4. Authentication is session-cookie based via `nuxt-auth-utils`.

### Data model

Content is normalized in SurrealDB:

- `post` — title, slug, summary, status, visibility, timestamps, view/word counts, and version
  flags. (Block content is stored separately.)
- `block` — one row per top-level editor block, with the Tiptap node, flattened search text, and a
  content hash for diffing.
- `versions` + `has_version` + `has_blocks` — post content snapshots used for history, diffs, and
  restore.
- `files` + `folder` — the hash-addressed media library.
- `tag`, `category` — taxonomy, linked to posts via the `tagged` and `categorized_as` relations.
- `links` — explicit post-to-post relationships used by the graph view.
- `users` — accounts and roles (superadmin, admin, author, viewer).
- `app_settings` — key/value store for site settings (visibility, logging, media, etc.).
- `edit_lock` — ensures a single active editor per post.

Full-text indexes cover post titles and summaries, block text, and media names/comments, using a
multilingual analyzer tuned for English and CJK content.
