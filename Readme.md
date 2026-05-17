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

## Project Layout

```text
assets/css/main.css                Global Tailwind and editor/content styles
components/admin/TiptapEditor.vue  Rich admin editor wrapper
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
- `asset` stores uploaded local file metadata and SHA-256 hashes for deduplication.
- `concept` stores wiki-link topic hubs.
- `tag` and `category` are prepared for future taxonomy features.

Graph relation tables:

- `mentions`: `post -> concept`, created from Tiptap `wikiLink` nodes on save.
- `tagged`: `post -> tag`, reserved for tags.
- `categorized_as`: `post -> category`, reserved for categories.
- `post_reference`: `post -> post`, reserved for explicit post-to-post links.

Full-text indexes are defined on `post.title`, `post.summary`, and `post.content_text` using SurrealDB 3 `FULLTEXT ANALYZER` syntax.

### Admin Editor

[components/admin/TiptapEditor.vue](components/admin/TiptapEditor.vue) wraps Tiptap and emits the full JSON document back to the post form.

Supported editor features:

- Headings, paragraphs, bold, italic, strike
- Bullet and ordered lists
- Blockquotes
- Links
- Code blocks with language selection
- Image upload from toolbar, paste, or drag/drop
- Mermaid diagram nodes
- Wiki-link nodes through `[[Concept]]` typing or the toolbar search field

Uploaded images go through [server/api/admin/upload.post.ts](server/api/admin/upload.post.ts). Files are written to `public/uploads/<year>/<month>/<hash>.<ext>` and ignored by git.

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