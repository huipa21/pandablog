# PandaBlog

PandaBlog is a Nuxt-based personal knowledge management blog. It has a public SSR blog frontend and a protected admin workspace for writing rich posts, uploading assets, and building wiki-style concept links backed by SurrealDB graph relations.

## Stack

- Nuxt 4, Vue 3, TypeScript, Nitro server routes
- Nuxt UI, Tailwind CSS, Nuxt Icon, Nuxt Image
- SurrealDB 3.x for posts, assets, concepts, full-text indexes, and graph relations
- `nuxt-auth-utils` for encrypted session cookies
- Tiptap v2 for the admin editor
- Shiki for public code block rendering
- Mermaid for client-side diagram rendering

## Requirements

- Node.js 22+ recommended
- npm
- A reachable SurrealDB 3.x instance

The repository includes [docker-compose.yml](docker-compose.yml) for a local SurrealDB container, but the app can also connect to a remote SurrealDB WebSocket endpoint.

## Environment

Create `.env` from [.env.example](.env.example):

```bash
cp .env.example .env
```

Required values:

```env
SURREAL_URL="wss://your-surreal-host/rpc"
SURREAL_NAMESPACE="main"
SURREAL_DATABASE="main"
SURREAL_ROOT="root-or-admin-user"
SURREAL_ROOT_PASSWORD="your-db-password"

NUXT_SESSION_PASSWORD="at-least-32-random-characters"
```

Optional (recommended) least-privilege runtime user — see
[Scoped database user](#scoped-database-user):

```env
SURREAL_APP_USER="pandablog_app"
SURREAL_APP_PASSWORD="another-strong-password"
```

On first deployment, visit `/admin` and complete the setup wizard. Admin username is fixed as `admin`; the wizard stores the password hash in SurrealDB `app_settings`.

### Optional Analytics Geo Database

City-level analytics use a local MaxMind-compatible `.mmdb` file, not a SurrealDB table. Download the DB-IP City Lite database in MMDB format from DB-IP, then place it at:

```text
storage/geoip/dbip-city-lite.mmdb
```

To use a different location, set `GEOIP_DB_PATH` or `NUXT_GEOIP_DB_PATH` to the absolute path. In Docker, mount the file or the whole `storage` volume into the app container so it exists at `/app/storage/geoip/dbip-city-lite.mmdb`.

## Install And Run

Install dependencies:

```bash
npm install
```

Start SurrealDB locally if you are not using a remote instance:

```bash
docker compose up -d surrealdb
```

Start the Nuxt dev server:

```bash
npm run dev
```

Open:

- Public site: `http://127.0.0.1:3000/`
- Admin login: `http://127.0.0.1:3000/admin/login`

Production build:

```bash
npm run build
npm run preview
```

Typecheck:

```bash
npm run typecheck
```

Browser e2e tests:

```bash
$env:E2E_ADMIN_USERNAME="<your-e2e-admin-username>"
$env:E2E_ADMIN_PASSWORD="<your-e2e-admin-password>"
npm run test:e2e
```

The e2e suite starts the Nuxt dev server when `PLAYWRIGHT_BASE_URL` is not set. Set `PLAYWRIGHT_BASE_URL` to test an already-running local or staging instance.

## Build Docker Image

Build the production image from `Dockerfile`:

```bash
docker build -t pandablog:latest .
```

The default image uses `node:22-bookworm-slim` for native-module compatibility.
To test a smaller Alpine-based image, build both stages from Alpine:

```bash
docker build --build-arg NODE_IMAGE=node:22-alpine -t pandablog:alpine .
```

Only promote the Alpine image after a smoke test of login, image upload/variant
generation, backups, and public post rendering. Native modules such as `sharp`
and `argon2` are compiled for the selected base image.

Check image size and runtime memory:

```bash
docker images pandablog
docker history --no-trunc pandablog:latest
docker run --rm pandablog:latest sh -c 'du -h -d 3 /app | sort -hr | head -40'
docker stats --no-stream pandablog-app
```

A several-hundred-MB image is expected for this SSR app because it includes the
Node runtime, Nuxt/Nitro server output, native image/auth dependencies, syntax
highlighting, editor assets, Mermaid, and CJK text tooling. Around 100-200 MiB
memory under light personal traffic is normal; measure again after admin editor
use, media processing, and backup operations.

Optional: export the image as a tarball for transfer to another host:

```bash
docker save -o pandablog-latest.tar pandablog:latest
```

If your target host uses Podman:

```bash
podman load -i pandablog-latest.tar
```

Run the image directly:

```bash
docker run -d \
  --name pandablog \
  -p 127.0.0.1:3000:3000 \
  --env-file .env \
  -v pandablog-storage:/app/storage \
  -v pandablog-data:/app/.data \
  pandablog:latest
```

Or use the provided production compose file:

```bash
# Option A: use locally built image
set PANDABLOG_IMAGE=pandablog:latest

# Option B: if loaded as localhost/pandablog:latest
# set PANDABLOG_IMAGE=localhost/pandablog:latest

docker compose -f docker-compose.prod.yml up -d
```

Verify container health/logs:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
```

Notes:

- Keep real secrets in runtime `.env`; do not bake secrets into the image.
- `docker-compose.prod.yml` expects `NUXT_*` variables (for example `NUXT_SURREAL_URL`, `NUXT_SESSION_PASSWORD`) in `.env`.
- First deployment still requires opening `/admin` once to complete setup if `app_settings` is empty.

## Security And Reverse Proxy

PandaBlog is designed to run behind a TLS-terminating reverse proxy (nginx,
Caddy, Traefik, or Cloudflare). The provided run commands bind the app to
`127.0.0.1:3000` so only the proxy can reach it. The proxy should terminate
HTTPS; in production the app emits HSTS and other security headers (see
[server/middleware/security-headers.ts](server/middleware/security-headers.ts)).

### Client IP And The `trust_proxy_headers` Setting

The app derives each request's client IP from the `X-Forwarded-For` header when
the runtime setting `trust_proxy_headers` is enabled. This client IP drives
security-sensitive controls:

- Login rate limiting and temporary lockout after repeated failures
- Public rate limiting on search and analytics tracking
- Password-protected post unlock throttling
- Access logs, activity records, and geo lookups

`trust_proxy_headers` defaults to `true` and is stored in the `app_settings`
table under the `trust_proxy_headers` key (an admin-tier setting).

> [!IMPORTANT]
> Only keep `trust_proxy_headers` enabled when a **trusted** reverse proxy sits
> in front of the app and **overwrites** `X-Forwarded-For` with the real client
> IP (stripping any client-supplied value). If the app is exposed directly to
> the internet with no such proxy, set `trust_proxy_headers` to `false` —
> otherwise any client can spoof `X-Forwarded-For` to forge their IP, bypassing
> rate limits and login lockout and poisoning access logs and analytics.

Example proxy configuration that sets a trustworthy forwarded IP:

```nginx
# nginx
proxy_set_header X-Forwarded-For $remote_addr;   # overwrite, do not append
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Host $host;
```

```caddy
# Caddy automatically sets X-Forwarded-For/Proto when used as a reverse_proxy
reverse_proxy 127.0.0.1:3000
```

### Scoped database user

By default the app authenticates to SurrealDB as the root user for everything.
For defence in depth you can run normal request traffic as a least-privilege,
**database-scoped** `EDITOR` user, reserving root for the few operations that
actually need it.

Set both of these (plus `NUXT_`-prefixed variants in Docker):

```env
SURREAL_APP_USER="pandablog_app"        # a simple identifier (letters/digits/_)
SURREAL_APP_PASSWORD="another-strong-password"
```

When both are set:

- At boot the app uses **root** once to provision/update this user via
  `DEFINE USER ... ON DATABASE ... ROLES EDITOR` (idempotent — rotating
  `SURREAL_APP_PASSWORD` simply takes effect on the next restart), then runs the
  schema and migrations.
- All normal request queries then sign in as the scoped `EDITOR` user, which can
  read and write data but **cannot** manage database users/accesses or other
  databases.
- **Root is still required** and is used only at boot (provisioning + schema) and
  for backup/restore (which stages and exports via the SurrealDB HTTP endpoint).
  Keep `SURREAL_ROOT` / `SURREAL_ROOT_PASSWORD` set.

If either variable is unset, the app falls back to using root for runtime
queries (the previous behaviour), so this feature is fully opt-in.

### Two-factor authentication (TOTP)

Each account can enable time-based one-time password (TOTP) two-factor
authentication from **Admin → Settings → Security**. Superadmins can also turn
on **Require MFA for administrators**, which forces every superadmin/admin
without MFA to enrol an authenticator app the next time they sign in.

TOTP secrets are stored encrypted at rest (AES-256-GCM). The encryption key is
derived from `NUXT_MFA_SECRET` when set, otherwise it falls back to
`NUXT_SESSION_PASSWORD`:

```env
NUXT_MFA_SECRET="a-separate-strong-random-secret"   # optional but recommended
```

- Setting a dedicated `NUXT_MFA_SECRET` decouples MFA secrets from the session
  cookie key so you can rotate one without the other.
- **Rotating this key (or `NUXT_SESSION_PASSWORD` when no MFA secret is set)
  invalidates all stored TOTP secrets** — affected users must re-enrol. Backup
  codes are unaffected (they are hashed, not encrypted).
- Database backups include the encrypted `totp_secret`, so a restore only works
  with the matching key. Keep the secret with your backups' threat model in mind.

## Project Layout

```text
assets/css/main.css                Global Tailwind and editor/content styles
components/admin/TiptapEditor.vue  Rich admin editor wrapper
components/admin/Media*.vue       Media library, uploader, picker, folders, orphans
components/admin/editor/*          Tiptap Vue node views
components/content/*               Public Tiptap JSON renderers
extensions/*                       Custom Tiptap nodes
layouts/admin.vue                  Protected admin shell
layouts/default.vue                Public shell
middleware/admin.global.ts         Client-side admin route guard
pages/admin/*                      Admin login, dashboard, posts UI
pages/blog/[slug].vue              Public post page
pages/concept/[slug].vue           Public concept page for wiki-links
server/api/*                       Nitro API endpoints
server/plugins/db-init.ts          SurrealDB schema bootstrap
server/utils/*                     DB, auth, content, wiki-link helpers
types/content.ts                   Shared post/concept types
```

## How The App Works

### Runtime Flow

1. Nuxt starts and `server/plugins/db-init.ts` connects to SurrealDB.
2. The schema in `server/utils/schema.surql` is applied with `IF NOT EXISTS`/`OVERWRITE` where needed.
3. Public pages call cached Nitro endpoints under `server/api/posts` and `server/api/concepts`.
4. Admin pages call protected endpoints under `server/api/admin`.
5. Auth is session-cookie based via `nuxt-auth-utils`.

### SurrealDB Model

Core tables:

- `post` stores title, slug, summary, Tiptap JSON, flattened search text, status, timestamps, and view count.
- `files` stores hash-addressed media records. The SHA-256 hash is the record id and the stored filename.
- `folder` stores user-created media folders. Month folders are virtual and derived from `files.uploaded_at`.
- `asset` is the older upload table kept for compatibility with existing installs.
- `concept` stores wiki-link topic hubs.
- `tag` and `category` are prepared for future taxonomy features.

Graph relation tables:

- `mentions`: `post -> concept`, created from Tiptap `wikiLink` nodes on save.
- `tagged`: `post -> tag`, reserved for tags.
- `categorized_as`: `post -> category`, reserved for categories.
- `post_reference`: `post -> post`, reserved for explicit post-to-post links.

Full-text indexes are defined on `post.title`, `post.summary`, `post.content_text`, `files.original_name`, and `files.comment` using SurrealDB 3 `FULLTEXT ANALYZER` syntax.

### Media Library

Admin media lives at `/admin/media` and is backed by [server/api/media](server/api/media). Uploads can start from the media library, the reusable [components/admin/MediaPicker.vue](components/admin/MediaPicker.vue), post editors, and existing settings upload fields.

Files are hashed with SHA-256 and stored in year/month folders:

```text
storage/uploads/YYYY/MM/<hash>.<ext>
storage/variants/thumbnail/YYYY/MM/<hash>.webp
storage/variants/medium/YYYY/MM/<hash>.webp
storage/variants/large/YYYY/MM/<hash>.webp
```

The `files` record stores `hash`, `original_name`, `stored_name`, `mime_type`, `size`, `extension`, timestamps, optional `comment`, `is_image`, `image_meta`, `folders`, `tags`, `reference_count`, `referenced_by`, `original_path`, and `variants`. Duplicate uploads reuse the existing hash record and increment `reference_count`.

Images are processed with `sharp` for metadata and generated WebP variants (`thumbnail`, `medium`, `large`). File bytes are served from `/api/media/file/<hash>`, and variants from `/api/media/variant/<size>/<hash>` with immutable cache headers.

Search supports combined filters for name/comment text, upload date range, type/MIME, custom folder, tag, and orphan state. Custom folder CRUD endpoints live under `/api/media/folders`; virtual month folders are computed from `uploaded_at` and never affect disk layout.

Orphans are files where `reference_count = 0` and `referenced_by = []`. Use `GET /api/media/orphans` to list them and `POST /api/media/orphans/cleanup` to delete database records plus physical original/variant files. The admin UI requires confirmation for delete and orphan cleanup actions.

Optional scheduled orphan cleanup is configured in Admin -> Settings -> Media and stored in `app_settings`.

### Admin Editor

[components/admin/TiptapEditor.vue](components/admin/TiptapEditor.vue) wraps Tiptap and emits the full JSON document back to the post form.

Supported editor features:

- Headings, paragraphs, bold, italic, strike
- Bullet and ordered lists
- Blockquotes
- Links
- Code blocks with language selection
- Image insertion through the media picker, plus paste or drag/drop upload
- Mermaid diagram nodes
- Wiki-link nodes through `[[Concept]]` typing or the toolbar search field

Uploaded images go through [server/api/admin/upload.post.ts](server/api/admin/upload.post.ts), which now delegates to the hash-based media library.

### Rich Content Rendering

Public rendering starts in [components/content/ContentRenderer.vue](components/content/ContentRenderer.vue). It recursively walks Tiptap JSON and delegates rich nodes:

- `codeBlock` -> [components/content/NodeCodeBlock.vue](components/content/NodeCodeBlock.vue), rendered with Shiki during SSR.
- `mermaid` -> [components/content/NodeMermaid.vue](components/content/NodeMermaid.vue), rendered in the browser with Mermaid inside `<ClientOnly>`.
- `wikiLink` -> [components/content/NodeWikiLink.vue](components/content/NodeWikiLink.vue), linking to `/concept/<slug>`.
- `image` -> [components/content/NodeImage.vue](components/content/NodeImage.vue), rendered with `NuxtImg`.

Unknown nodes fall back to a normal wrapper and continue rendering their children so old posts do not crash after editor schema changes.

### Wiki-Links And Concepts

The custom wiki-link extension lives in [extensions/wikiLink.ts](extensions/wikiLink.ts). It converts `[[Some Concept]]` into a Tiptap `wikiLink` node.

On post create/update:

1. `server/utils/wikiLinks.ts` extracts all `wikiLink` nodes from `content_json`.
2. Missing `concept` records are created.
3. Old `mentions` relations for the post are deleted.
4. Current `post -> mentions -> concept` relations are written.

The concept page at `/concept/[slug]` lists published posts that mention that concept.

### Caching

Public post and concept APIs use Nitro `defineCachedEventHandler` with short stale-while-revalidate caching. This is intentionally simple for now; later phases can add tag-based invalidation and longer ISR-style caching.

## API Overview

Public:

- `GET /api/posts` lists published posts.
- `GET /api/posts/:slug` returns a published post.
- `GET /api/concepts/:slug` returns a concept and published posts mentioning it.

Auth:

- `POST /api/auth/login` creates an admin session.
- `POST /api/auth/logout` clears the session.
- `GET /api/auth/session` returns the current session state.

Admin:

- `GET /api/admin/posts` lists non-archived posts.
- `POST /api/admin/posts` creates a post.
- `GET /api/admin/posts/:id` fetches a post.
- `PUT /api/admin/posts/:id` updates a post and syncs wiki relations.
- `DELETE /api/admin/posts/:id` archives a post.
- `POST /api/admin/upload` uploads and deduplicates a local asset.
- `GET /api/admin/concepts/search?q=` searches concepts and posts for the wiki-link picker.

Logging Admin:

- `GET /api/admin/settings/logging` returns current logging settings.
- `PUT /api/admin/settings/logging` updates logging settings and refreshes the in-memory cache.
- `POST /api/admin/settings/logging/reset` resets logging settings to defaults.
- `GET /api/admin/logs/access` queries access logs with filter + pagination.
- `GET /api/admin/logs/activity` queries activity logs with filter + pagination.
- `GET /api/admin/logs/errors` queries error logs with filter + pagination.
- `GET /api/admin/logs/:type/:id` returns a single log record by type + id.
- `GET /api/admin/logs/:type/export?format=csv|json` exports filtered logs (capped at 10k rows).
- `POST /api/admin/logs/cleanup` manually deletes logs with `{ type, mode, value }`, where mode is `older_than_days` or `keep_latest`.
- `DELETE /api/admin/logs/:type` purges a full log table (requires confirmation token in body).
- `GET /api/admin/logs/stats` returns counts + oldest/newest timestamps + size estimate.

## Logging System

The app now includes a runtime-configurable logging system with SurrealDB-backed settings and log tables.

### SurrealDB storage

- Logging configuration is stored in `app_settings` with key `logging`.
- `access_logs`
- `activity_logs`
- `error_logs`

The log tables are created in `server/utils/schema.surql` and applied automatically by `server/plugins/db-init.ts`.

### Runtime behavior

- Logging settings are cached in memory and initialized on server startup.
- Updating logging settings via API atomically replaces the cache object.
- Logging DB writes are fire-and-forget and isolated from request failures.
- Metadata/context fields are redacted recursively using configured `redact_fields`.
- Oversized metadata is truncated with `{ _truncated: true }` payload marker.
- A 60-second DB write circuit breaker prevents repeated write failures from cascading.
- Log cleanup is manual: delete rows older than a day count or keep the latest N rows for one log type.

### Activity action naming

Use `<resource>.<verb>` naming for activity logs. Current actions in this codebase:

- `auth.login`
- `site.visibility.update`
- `system.log_cleanup`

### Tests

Run logging unit tests:

```bash
npm run test:unit
```

## Verification

Current checks used during implementation:

```bash
npm run typecheck
npm run build
```

Manual smoke flow:

1. Sign in at `/admin/login`.
2. Create a post in `/admin/posts`.
3. Add formatted text, an image, a code block, a Mermaid diagram, and a wiki-link.
4. Publish the post.
5. Open `/blog/<slug>` and `/concept/<wiki-link-slug>`.

## Notes For Future Phases

- Add a dedicated full-site search UI using SurrealDB full-text indexes.
- Add a graph visualization route with Cytoscape.js.
- Add analytics collection and dashboard widgets.
- Add stronger cache invalidation when posts are published or archived.

## Backup & Restore

Admin → Tools → Backups (superadmin only) provides manual snapshot management.

### Snapshot layout

Each snapshot is stored in `storage/backups/<id>/`:

```
db.surql.gz     Gzipped SurrealDB export (full DB, every snapshot)
media.tar.gz    Gzipped tar of media originals (full or incremental set)
manifest.json   SHA-256 hashes + metadata for integrity verification
```

### Backup types

- **Full** — entire database + all files currently in `storage/uploads/`.
- **Incremental** — fresh full DB dump + only media files that are *new* since the parent snapshot.
  Incrementals form a chain; restore walks the chain oldest-first to reconstruct the full media set.

### Restore semantics

Restore is **replace-only**: the DB is wiped and reimported, variant images (`storage/variants/`) are cleared, then each chain ancestor's media tar is extracted into `storage/uploads/` (idempotent by hash filename). Variants are regenerated in the background at a concurrency of 2 after restore completes.

### Export / Import

Use **Download DB** and **Download Media** buttons to export a snapshot's archives. Upload them via **Import backup** on another instance to register them as a new restorable full snapshot. Optional `manifest.json` enables SHA-256 integrity verification on import.

### Known limitations

- No scheduled/automatic backups in v1 (manual trigger only).
- No per-snapshot retention policy (delete manually from the UI).
- Consolidated incremental download returns the tip tar only; restore automatically applies the full chain.
- The in-process backup mutex prevents concurrent backups; only one job runs at a time per Node process.

## Auth Setup

The admin login uses environment variables. The `.env` file in the project root has **highest priority** over OS environment variables.

### Configure admin credentials

On a fresh deployment, open `/admin` and complete the first-run setup wizard. The username is always `admin`; the password hash is stored in the SurrealDB `app_settings` table.

### Required env vars

| Variable | Purpose | Required |
|---|---|---|
| `SURREAL_URL` | SurrealDB RPC endpoint | Yes |
| `SURREAL_NAMESPACE` | DB namespace | Yes |
| `SURREAL_DATABASE` | DB name | Yes |
| `SURREAL_ROOT` | Root user (boot provisioning + schema + backups) | Yes |
| `SURREAL_ROOT_PASSWORD` | Root password | Yes |
| `SURREAL_APP_USER` | Optional least-privilege DB-scoped runtime user (see [Scoped database user](#scoped-database-user)) | No |
| `SURREAL_APP_PASSWORD` | Password for `SURREAL_APP_USER` (required if it is set) | No |
| `NUXT_SESSION_PASSWORD` | 32+ char random string for session cookie encryption | Yes (prod hard-fails without it) |
| `NUXT_MFA_SECRET` | Optional key for encrypting TOTP secrets at rest; falls back to `NUXT_SESSION_PASSWORD`. Rotating it forces MFA re-enrolment (see [Two-factor authentication](#two-factor-authentication-totp)) | No |

### Rate limiting

Failed login attempts are tracked per IP. After 5 failed attempts within 15 minutes, that IP is locked for 15 minutes. Storage lives at `./.data/rate-limit/` (gitignored).

### Rotating the admin password

Open Admin -> Settings -> Profile -> User Info and change the password there. Existing sessions remain valid until expiry; log out from `/admin` to invalidate the current browser session immediately.

### Production reverse proxy (nginx)

When Admin -> Settings -> Site -> Network -> Trust reverse proxy headers is enabled, the login endpoint trusts the `X-Forwarded-For` header to determine the client IP for rate limiting. **Your nginx config must strip any inbound `X-Forwarded-For` header from clients and set its own**, otherwise an attacker can spoof the header to bypass per-IP lockout.

Recommended nginx location block:

```nginx
location / {
    # Always overwrite (do NOT use add_header — that appends).
    proxy_set_header X-Real-IP        $remote_addr;
    proxy_set_header X-Forwarded-For  $remote_addr;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host             $host;

    proxy_pass http://127.0.0.1:3000;
}
```

Key point: `proxy_set_header X-Forwarded-For $remote_addr;` **replaces** any client-supplied value with the real socket address nginx sees. Do not use `$proxy_add_x_forwarded_for` here unless you have an additional trusted proxy in front of nginx.

### HTTP vs HTTPS in production

If you serve over plain HTTP (no TLS), avoid production mode for admin traffic. However:
- Anyone on the network path can read the session cookie.
- `Secure` cookies cannot be transmitted over HTTP at all in modern browsers.

Nuxt enables secure session cookies in production mode. **If you must serve admin traffic over HTTP in prod**, sessions will silently fail to set in the browser. Either:
1. Use HTTPS for the admin area (strongly recommended), or
2. Manually override the cookie config in `nuxt.config.ts` (not recommended; do this only with full awareness of the risk).

The public blog frontend can safely run on HTTP; only the admin/login flow is sensitive.

## Theming

The public blog uses an uploadable theme system. Themes live in `./themes/<id>/`.

### Theme structure

```
themes/my-theme/
├── theme.json      # manifest (required)
├── tokens.json     # design tokens for light + dark (required)
├── theme.css       # CSS overrides (required)
└── preview.png     # 1200x630 thumbnail (required)
```

See `themes/default/` for a reference implementation.

### Manifest fields (`theme.json`)

| Field | Required | Description |
|---|---|---|
| `id` | yes | Lowercase alphanumeric + dashes, 2-50 chars. Reserved: `default`. |
| `name` | yes | Display name. |
| `version` | yes | Semver `x.y.z`. |
| `author` | yes | Free text. |
| `description` | yes | Free text, ≤500 chars. |
| `supports` | yes | Array containing `"light"` and/or `"dark"`. |
| `preview` | yes | Filename of the preview image. |
| `tokens` | yes | Filename of the tokens JSON. |
| `css` | yes | Filename of the CSS overrides. |
| `layout` | yes | Layout preferences (see below). |

### Layout preferences

```json
{
  "type": "three-column",          // or "two-column" | "single-column"
  "leftSidebar": "toc",            // or "nav" | null
  "rightSidebar": "meta-graph",    // or "meta" | "related" | null
   "maxContentWidth": "72rem",
  "showCoverImage": true,
  "stickyHeader": true
}
```

### Tokens (`tokens.json`)

Two top-level keys: `light` and `dark`. Each contains categories: `color`, `font`, `size`, `space`, `radius`, `shadow`. Each category is a flat object mapping name → CSS value.

Tokens are exposed as CSS custom properties: `color.bg` → `--color-bg`, `font.sans` → `--font-sans`, etc.

### Uploading

1. Zip your theme folder (containing `theme.json` at root or inside one top-level folder).
2. Go to **Admin → Settings → Themes**.
3. Click **Upload .zip**.
4. The zip must be ≤5 MB and must pass validation:
   - No path traversal in entry names
   - Allowed extensions only (`.json`, `.css`, image, `.md`, `.txt`)
   - Manifest passes schema validation
   - CSS does not use `@import`, `javascript:`, or `expression()`
   - Theme id must not already exist
5. After upload, click **Preview** to inspect, then **Activate** to publish.

## Site and post visibility

PandaBlog has two independent visibility layers: site-wide and per-post.

### Site-wide visibility

Set in **Admin -> Settings -> Visibility**.

- **Public** (default): anyone can browse the site. Per-post rules still apply.
- **Private**: anonymous visitors are redirected to login. Only the admin can browse.

The setting is stored in `app_settings:site_visibility` and enforced via Nitro middleware.

### Per-post visibility

Set on each post in the editor.

- **Public**: visible to anyone (default).
- **Private**: hidden from non-admins. Returns 404 to anonymous visitors. Excluded from public lists and concept pages.
- **Password protected**: appears in public lists, but the body is gated behind a password. Correct entry sets a 7-day signed cookie so the post stays unlocked on later visits.

Passwords are stored as argon2id hashes. Failed unlock attempts are rate-limited (5 per 15 minutes per IP per post).

### Admin override

The logged-in admin always sees everything regardless of either layer.

### Failure mode

If SurrealDB is unreachable while reading site visibility, PandaBlog defaults to `'public'` (fail-open). This prevents DB outages from locking out the site.