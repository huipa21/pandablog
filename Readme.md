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

3. **Create a `.env` file** in the project root (see [Environment variables](#environment-variables)).

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

PandaBlog reads a `.env` file in the project root. During development these values take
priority over OS environment variables.

### Minimal `.env` for local development

```env
# SurrealDB connection
SURREAL_URL="ws://127.0.0.1:8000/rpc"
SURREAL_NAMESPACE="main"
SURREAL_DATABASE="main"
SURREAL_ROOT="root"
SURREAL_ROOT_PASSWORD="your-local-password"

# Session cookie encryption — MUST be 32+ random characters.
# Generate one with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
NUXT_SESSION_PASSWORD="replace-with-a-32-plus-character-random-string"
```

### Reference

| Variable | Purpose | Required |
| --- | --- | --- |
| `SURREAL_URL` | SurrealDB WebSocket RPC endpoint | Yes |
| `SURREAL_NAMESPACE` | Database namespace | Yes |
| `SURREAL_DATABASE` | Database name | Yes |
| `SURREAL_ROOT` | Root user (used at boot for provisioning, schema, and backups) | Yes |
| `SURREAL_ROOT_PASSWORD` | Root user password | Yes |
| `NUXT_SESSION_PASSWORD` | 32+ character random string for session cookie encryption. Production refuses to start without it. | Yes |
| `SURREAL_APP_USER` | Optional least-privilege, database-scoped runtime user (see [Scoped database user](#scoped-database-user)) | No |
| `SURREAL_APP_PASSWORD` | Password for `SURREAL_APP_USER` (required if it is set) | No |
| `MFA_SECRET` | Optional dedicated key for encrypting stored TOTP secrets at rest; falls back to `NUXT_SESSION_PASSWORD` (see [Two-factor authentication](#two-factor-authentication)) | No |
| `GEOIP_DB_PATH` | Path to a MaxMind-compatible `.mmdb` file for city-level analytics | No |
| `APP_SPONSOR` | Enables an optional sponsor flag for the public UI | No |

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

To use a different location, set `GEOIP_DB_PATH` (or `NUXT_GEOIP_DB_PATH` in Docker). Until a
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

By default the app authenticates to SurrealDB as root. For defense in depth, you can run normal
request traffic as a least-privilege, database-scoped `EDITOR` user and reserve root for boot-time
provisioning, schema, and backups. Set both:

```env
SURREAL_APP_USER="pandablog_app"        # a simple identifier (letters/digits/_)
SURREAL_APP_PASSWORD="a-strong-password"
```

When both are set, the app provisions/updates this user at boot using root (idempotent — rotating
the password just takes effect on restart), then signs in as the scoped user for normal queries.
Root remains required for boot and backups, so keep `SURREAL_ROOT` / `SURREAL_ROOT_PASSWORD` set.
If either variable is unset, the app falls back to root for runtime queries.

### Two-factor authentication

Each account can enable TOTP from **Admin → Settings → Security**. Superadmins can require MFA for
all administrators, forcing enrollment at next sign-in.

TOTP secrets are encrypted at rest (AES-256-GCM). The key is derived from `MFA_SECRET` when set,
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
   docker build -t pandablog:latest .
   ```

   The default base image is `node:22-bookworm-slim` for native-module compatibility. To
   experiment with a smaller image, build from Alpine:

   ```bash
   docker build --build-arg NODE_IMAGE=node:22-alpine -t pandablog:alpine .
   ```

   Only promote the Alpine image after smoke-testing login, image upload/variant generation,
   backups, and public post rendering — native modules such as `sharp` and `argon2` are compiled
   for the selected base image.

3. **Configure runtime env.** The production Compose file expects `NUXT_`-prefixed variables. Copy
   the template and fill in real values:

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
     -v pandablog-storage:/app/storage \
     pandablog:latest
   ```

Notes:

- Keep real secrets in the runtime `.env`; never bake them into the image.
- Bind-mount or use a volume for `/app/storage` so uploads, variants, backups, and the GeoIP
  database persist across restarts.
- First deployment still requires opening `/admin` once to complete setup.

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
your `.env` file via `E2E_ADMIN_USERNAME` and `E2E_ADMIN_PASSWORD`.

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
