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
APP_ENV="dev"

SURREAL_URL="wss://your-surreal-host/rpc"
SURREAL_NAMESPACE="main"
SURREAL_DATABASE="main"
SURREAL_ROOT="root-or-admin-user"
SURREAL_ROOT_PASSWORD="your-db-password"

NUXT_SESSION_PASSWORD="at-least-32-random-characters"

APP_LOGIN_USERNAME="admin"
APP_LOGIN_PASSWORD_HASH="$argon2id$..."
```

Set `APP_ENV` to `dev` on the Windows development machine and `prod` on the Ubuntu server. The `.env` file has highest priority over OS environment variables.

See the [Auth setup](#auth-setup) section below for how to generate `APP_LOGIN_PASSWORD_HASH`.

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
$env:E2E_ADMIN_USERNAME="admin"
$env:E2E_ADMIN_PASSWORD="your-admin-password"
npm run test:e2e
```

The e2e suite starts the Nuxt dev server when `PLAYWRIGHT_BASE_URL` is not set. Set `PLAYWRIGHT_BASE_URL` to test an already-running local or staging instance.

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

Files are hashed with SHA-256 and stored by hash prefix instead of date folders:

```text
storage/uploads/<hash[0:2]>/<hash[2:4]>/<hash>.<ext>
storage/thumbnails/<hash[0:2]>/<hash[2:4]>/<hash>.webp
```

The `files` record stores `hash`, `original_name`, `stored_name`, `mime_type`, `size`, `extension`, timestamps, optional `comment`, `is_image`, `image_meta`, `folders`, `tags`, `reference_count`, `referenced_by`, `storage_path`, and `thumbnail_path`. Duplicate uploads reuse the existing hash record and increment `reference_count`.

Images are processed with `sharp` for metadata and 300x300 WebP thumbnails. File bytes are served from `/api/media/file/<hash>` and thumbnails from `/api/media/thumbnail/<hash>` with immutable cache headers.

Search supports combined filters for name/comment text, upload date range, type/MIME, custom folder, tag, and orphan state. Custom folder CRUD endpoints live under `/api/media/folders`; virtual month folders are computed from `uploaded_at` and never affect disk layout.

Orphans are files where `reference_count = 0` and `referenced_by = []`. Use `GET /api/media/orphans` to list them and `POST /api/media/orphans/cleanup` to delete database records plus physical files/thumbnails. The admin UI requires confirmation for delete and orphan cleanup actions.

Optional scheduled orphan cleanup is controlled by:

| Variable | Default | Purpose |
|---|---:|---|
| `MEDIA_ORPHAN_CLEANUP_ENABLED` | `false` | Enable scheduled orphan deletion |
| `MEDIA_ORPHAN_CLEANUP_DAYS` | `30` | Delete only orphans older than this many days |
| `MEDIA_ORPHAN_CLEANUP_CRON` | `0 4 * * *` | Cron expression for cleanup |

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
- `POST /api/admin/logs/cleanup` runs retention cleanup immediately.
- `DELETE /api/admin/logs/:type` purges a full log table (requires confirmation token in body).
- `GET /api/admin/logs/stats` returns counts + oldest/newest timestamps + size estimate.

## Logging System

The app now includes a runtime-configurable logging system with SurrealDB-backed settings and log tables.

### SurrealDB tables

- `logging_settings` (singleton record `logging_settings:current`)
- `access_logs`
- `activity_logs`
- `error_logs`

These tables are created in `server/utils/schema.surql` and applied automatically by `server/plugins/db-init.ts`.

### Runtime behavior

- Logging settings are cached in memory and initialized on server startup.
- Updating logging settings via API atomically replaces the cache object.
- Logging DB writes are fire-and-forget and isolated from request failures.
- Metadata/context fields are redacted recursively using configured `redact_fields`.
- Oversized metadata is truncated with `{ _truncated: true }` payload marker.
- A 60-second DB write circuit breaker prevents repeated write failures from cascading.
- Scheduled cleanup is controlled by `cleanup_cron` using `node-cron`.

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
- Add backup automation for both SurrealDB exports and `public/uploads`.

## Auth Setup

The admin login uses environment variables. The `.env` file in the project root has **highest priority** over OS environment variables.

### Configure admin credentials

1. Choose a password.
2. Hash it:
   ```bash
   npm run hash-password "your-strong-password"
   ```
3. Copy the output (`$argon2id$...`) into `.env` as `APP_LOGIN_PASSWORD_HASH`.
4. Set `APP_LOGIN_USERNAME` in `.env`.

### Required env vars

| Variable | Purpose | Required |
|---|---|---|
| `APP_ENV` | `dev` (local Windows) or `prod` (Ubuntu server) | Yes |
| `SURREAL_URL` | SurrealDB RPC endpoint | Yes |
| `SURREAL_NAMESPACE` | DB namespace | Yes |
| `SURREAL_DATABASE` | DB name | Yes |
| `SURREAL_ROOT` | Root user | Yes |
| `SURREAL_ROOT_PASSWORD` | Root password | Yes |
| `NUXT_SESSION_PASSWORD` | 32+ char random string for session cookie encryption | Yes (prod hard-fails without it) |
| `APP_LOGIN_USERNAME` | Admin username | Yes |
| `APP_LOGIN_PASSWORD_HASH` | argon2id hash of admin password | Yes |
| `MEDIA_ORPHAN_CLEANUP_ENABLED` | Enable scheduled orphan cleanup | No |
| `MEDIA_ORPHAN_CLEANUP_DAYS` | Orphan age threshold for scheduled cleanup | No |
| `MEDIA_ORPHAN_CLEANUP_CRON` | Cron schedule for orphan cleanup | No |

### Rate limiting

Failed login attempts are tracked per IP. After 5 failed attempts within 15 minutes, that IP is locked for 15 minutes. Storage lives at `./.data/rate-limit/` (gitignored).

### Rotating the admin password

Run `npm run hash-password "<new-password>"` and replace the value of `APP_LOGIN_PASSWORD_HASH` in `.env`. Restart the app. Existing sessions remain valid until expiry — log out from `/admin` to invalidate immediately.

### Production reverse proxy (nginx)

When `APP_ENV=prod`, the login endpoint trusts the `X-Forwarded-For` header to determine the client IP for rate limiting. **Your nginx config must strip any inbound `X-Forwarded-For` header from clients and set its own**, otherwise an attacker can spoof the header to bypass per-IP lockout.

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

If you serve over plain HTTP (no TLS), session cookies will still be sent because cookie `Secure` flag follows `APP_ENV`. However:
- Anyone on the network path can read the session cookie.
- `Secure` cookies cannot be transmitted over HTTP at all in modern browsers.

Currently `Secure` is enabled when `APP_ENV=prod`. **If you must serve admin traffic over HTTP in prod**, sessions will silently fail to set in the browser. Either:
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
  "maxContentWidth": "720px",
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

The setting is stored in `app_setting:site_visibility` and enforced via Nitro middleware.

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