# Spec 00: Target behavior and invariants

**Approved target, not current behavior.** Applies to FF-01 to FF-07 in [plan](../plan.md). Read the [server](./01-server-recipes.md), [client](./02-client-recipes.md) and [build/tests](./03-build-tests-docs.md) recipes together with this spec.

## 1. One build, runtime settings only

After this change:

- There is **no** `pandablog.modules.json`, no `__PB_MODULE_*__`/`__PB_BLOCK_*__` constant, no `runtimeConfig.public.modules`, and no `nuxt.options.ignore` entries driven by features.
- Every route, page, plugin, component, theme and the annotation dictionary is in every build.
- An optional feature is controlled only by an existing or new **admin setting stored in `app_settings`**. The settings are read at runtime, so no rebuild is needed.

## 2. Feature-by-feature contract

| Feature | Runtime gate after change | Code that disappears |
|---|---|---|
| Editor blocks | None. All blocks are in the inserter, slash menu, toolbar transforms and settings panels | `optionalBlockEnabled`, `isBlockEnabled`, every `__PB_BLOCK_*` branch, the disabled dialogue node view |
| Public rendering | None. Every known node type renders with its component | `disabledBlockTypes`, "Disabled content block" placeholder |
| Activity/error logs | Existing logging settings (`enabled`, `activity_log_enabled`, `error_log_enabled`) | Build/module checks in plugins, logger, admin helpers, retention, db-init, restore; `assertLogTypeEnabled` |
| Analytics | Existing `analytics_enabled` (default `false`); rollup plugin always registered (harmless without data) | Build/module checks in rollup plugin, db-init, restore |
| GeoIP | Present `.mmdb` file at `NUXT_GEOIP_DB_PATH` (unchanged) | `isGeoipEnabled()` module check |
| Users | Always multi-user; role checks unchanged | `accountAllowedInModuleMode`, single-user branches in layout, middleware, login and MFA session |
| Themes | Existing Themes settings page; all bundled themes shipped | Dockerfile theme deletion; nav flag |
| MFA | Per-user enrollment and `security_mfa_required_for_admins` (unchanged) | Module checks in login, device APIs, login page, security page |
| Security alerts | Existing `security_alerts_enabled` (default `false`) | Module check in `dispatchSecurityAlert`; page checks |
| Backups | Always available (superadmin only, unchanged) | Nav flag; schema stripping |
| Graph view | **New** `graph_view_enabled` (default `true`) | Build flag |
| Publish heatmap | **New** `publish_heatmap_enabled` (default `true`) | Build flag |
| Post versioning | Always on; bounded by the existing `post_versioning.snapshot_limit` | `collapsePostToCurrentVersion`, `collapsePostVersionHistory`, flag checks |

## 3. New public settings

### 3.1 Keys and defaults

| Key | Type | Default when absent or invalid | Public? | Written by |
|---|---|---|---|---|
| `graph_view_enabled` | boolean | `true` | Yes (part of `PUBLIC_SETTING_KEYS`, returned by `/api/site/bootstrap`) | `POST /api/admin/settings` (superadmin) |
| `publish_heatmap_enabled` | boolean | `true` | Yes | `POST /api/admin/settings` (superadmin) |

Rules:

- `true` is the default, because today's builds have both features enabled. No migration or boot write is needed. An absent key means "on".
- On write, `filterAdminSettings` coerces a non-boolean value to the default (`true`). It uses the same `booleanValue` helper as `analytics_enabled`.
- On read, `normalizePublicSettings` returns a strict boolean (`booleanValue(value, true)`).
- These are **display** settings, not security boundaries. They are public because the public site needs them to decide what to render.

### 3.2 Behavior when a setting is `false`

| Surface | `graph_view_enabled = false` | `publish_heatmap_enabled = false` |
|---|---|---|
| Home page | `BlogGraphOverviewWidget` not rendered | `BlogPublishFrequencyHeatmap` not rendered (no fetch) |
| Post page | `BlogKnowledgeGraph` not rendered | — |
| `/graph` page | 404 (`createError({ statusCode: 404, fatal: true })`) | — |
| API | `/api/graph/overview`, `/api/graph/cluster`, `/api/graph/tag`, `/api/graph/post/:slug` return 404 | `/api/posts/publish-frequency` returns 404 |
| Admin | Toggle shown in Settings → General → Public features | Same |

The server check reads `readPublicBootstrap().settings`. That payload is cached for 30 s and invalidated by every `POST /api/admin/settings`. The home page HTML is SWR-cached (`routeRules['/']`, maxAge 60 s), so the visible change can take up to about two minutes. This is accepted; do not add cache-busting machinery.

## 4. Invariants (must remain true)

1. **Rendering is independent of authoring.** No setting can hide content stored in a post.
2. Auth, CSRF, role and privacy checks are unchanged for multi-user installs. Routes that used to be excluded from the build (users, themes, backups, logs, analytics, MFA devices, versions) keep their **existing** handler-level authorization. Do not add or remove role checks.
3. **Analytics and security alerts stay opt-in** (default `false`), as today.
4. **The schema hash is unchanged for all-enabled installs:** `loadSchema()` must hash exactly the raw `server/utils/schema.surql` text. Today's all-enabled stripping returns the raw text unchanged, so the hash is identical.
5. **No boot migration, data rewrite or settings write** is added. Absent new keys mean `true`.
6. Request IDs, the maintenance fence, readiness, shutdown, restore paired rollback and backup safety are untouched.
7. No new environment variable, build option or flag framework replaces the old one.

## 5. Compatibility

| Situation | Result |
|---|---|
| Existing install, everything enabled (the owner's current manifest) | No behavior change. Two new toggles appear (both on). The manifest and configurator are gone |
| Stale `pandablog.modules.json` left in the source tree | The build prints a warning listing every `false` path. The file is otherwise ignored. See [operations](../operations.md) |
| Install previously built with some feature off | The feature's code is now present; follow the per-feature table in [operations](../operations.md#2-if-your-old-manifest-disabled-something) |
| Old API clients | No API removed. Routes that were excluded in some builds now exist in all builds |
| Downgrade to a previous image | Works. No schema or data change was made. A previous image with a disabled module simply ignores the extra tables/settings |
| Content created while a block was disabled | Already stored as JSON; now renders |

## 6. Non-goals

- No runtime per-block "allowed blocks" setting.
- No change to analytics privacy, MFA policy, backup format, log retention or theme installer behavior.
- No pruning of the dictionary, themes or GeoIP code.
- No bundle-size or performance claims without measurement.
