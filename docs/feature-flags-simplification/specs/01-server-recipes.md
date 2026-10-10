# Spec 01: Server recipes

**Approved target.** Tasks FF-02 (§8), FF-03 (§1–§7, §9) and FF-04 (§10). Apply the [replacement rule](../plan.md#3-what-always-on-means-for-code-the-replacement-rule). Line numbers refer to revision `d878a57` and are hints only. Search for the quoted text.

After each file, remove imports that became unused. The most common one is:

```ts
import { getRuntimeModuleConfig, resolveModuleFlags } from '~/utils/moduleFlags'
```

## 1. Logs

### 1.1 `server/plugins/logging-error-hook.ts`

Before (lines 6–13):

```ts
export default defineNitroPlugin((nitroApp) => {
  if (!__PB_MODULE_LOGS__) {
    return
  }
  const flags = resolveModuleFlags(getRuntimeModuleConfig())
  if (!flags.logs || !flags.errorLogs) {
    return
  }

  nitroApp.hooks.hook('error', (error, context) => {
```

After:

```ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, context) => {
```

The runtime `error_log_enabled` setting is already checked inside `logError`/settings. Do not add a new check.

### 1.2 `server/plugins/log-retention.ts`

Delete these lines (11–13):

```ts
  if (!__PB_MODULE_LOGS__ || !resolveModuleFlags(getRuntimeModuleConfig()).logs) {
    return
  }
```

### 1.3 `server/plugins/error-groups.ts`

Delete line 6:

```ts
  if (!__PB_MODULE_LOGS__ || !resolveModuleFlags(getRuntimeModuleConfig()).errorLogs) return
```

### 1.4 `server/utils/logging.ts`

- Line ~218, in `logError`: delete `if (!__PB_MODULE_LOGS__ || !resolveModuleFlags(getRuntimeModuleConfig()).errorLogs) return`.
- Line ~299, in `gatherLogStats`: delete `const flags = resolveModuleFlags(getRuntimeModuleConfig())`.
- Lines ~326–327: replace

  ```ts
  groups: flags.errorLogs ? Number(firstRow<{ total?: number }>(response, 2)?.total ?? 0) : 0,
  unread_groups: flags.errorLogs ? Number(firstRow<{ total?: number }>(response, 3)?.total ?? 0) : 0,
  ```

  with

  ```ts
  groups: Number(firstRow<{ total?: number }>(response, 2)?.total ?? 0),
  unread_groups: Number(firstRow<{ total?: number }>(response, 3)?.total ?? 0),
  ```

- Remove the `moduleFlags` import (line 11).

### 1.5 `server/utils/logging-admin.ts`

- Delete `function isLogTypeEnabled(...)` (lines ~207–215) and `export function assertLogTypeEnabled(...)` (lines ~65–71).
- In `parseLogType`, replace

  ```ts
  if (value === 'activity' || value === 'errors') {
    assertLogTypeEnabled(value)
    return value
  }
  ```

  with

  ```ts
  if (value === 'activity' || value === 'errors') {
    return value
  }
  ```

- In `listLogs`, delete the line `assertLogTypeEnabled(type)`.
- Keep the retired-`access` 404 branch exactly as it is.
- Remove the `moduleFlags` import.

### 1.6 Callers of `assertLogTypeEnabled`

Delete the import line and the call in each file:

- `server/api/admin/logs/cleanup.post.ts` (`assertLogTypeEnabled(parsed.data.type)`)
- `server/api/admin/logs/error-groups/index.get.ts`
- `server/api/admin/logs/error-groups/[fp].get.ts`
- `server/api/admin/logs/error-groups/bulk.post.ts`

Self-check: `rg -n assertLogTypeEnabled server` prints nothing.

### 1.7 `server/utils/log-retention.ts`

Before (lines ~51–58):

```ts
  if (!__PB_MODULE_LOGS__) {
    return complete()
  }
  const flags = resolveModuleFlags(getRuntimeModuleConfig())
  if (!flags.logs) {
    return complete()
  }
```

After: delete all of it. Then simplify the remaining `flags.*` uses:

- `enabled: flags.activityLogs && settings.activity_log_enabled` → `enabled: settings.activity_log_enabled`
- `enabled: flags.errorLogs && settings.error_log_enabled` → `enabled: settings.error_log_enabled`
- `if (flags.errorLogs && settings.error_log_enabled) {` → `if (settings.error_log_enabled) {`
- `if (flags.activityLogs && (total > 0 || report.errors.length)) {` → `if (total > 0 || report.errors.length) {`

If the local `complete` function is now unused, delete it, but **keep** the code that sets `report.finished_at`, `report.duration_ms` and `lastReport` at the end of the function. Read the whole function before deleting anything.

## 2. Analytics and GeoIP

### 2.1 `server/plugins/analytics-rollup.ts`

Delete line 9:

```ts
  if (!__PB_MODULE_ANALYTICS__ || !resolveModuleFlags(getRuntimeModuleConfig()).analytics) return
```

The rollup is safe when `analytics_enabled` is false: it only aggregates existing rows and applies retention.

### 2.2 `server/utils/analytics/geo.ts`

Delete `function isGeoipEnabled()` (lines ~118–124) and the four guards that call it:

```ts
  if (!isGeoipEnabled()) {
    return false   // or: return / return null
  }
```

The guards are in `analyticsGeoDatabaseAvailable`, `ensureAnalyticsGeoDir`, `getGeoReader` and `loadMaxmind`. The existing "file does not exist → `null`" logic in `openGeoReader` already handles a missing database. Remove the `moduleFlags` import.

## 3. Multi-user always on (delete single-user mode)

### 3.1 `server/utils/auth.ts`

- Delete the function:

  ```ts
  export function accountAllowedInModuleMode(user: Pick<SessionUser, 'id' | 'username'>): boolean {
    return resolveModuleFlags(getRuntimeModuleConfig()).multiUser || (user.id === 'users:admin' && user.username === 'admin')
  }
  ```

- In `resolveCurrentIdentity` (line ~34):
  `if (!account || account.active !== true || account.auth_epoch !== epoch || !accountAllowedInModuleMode(account)) return null`
  → `if (!account || account.active !== true || account.auth_epoch !== epoch) return null`
- In `isAdminTier` (line ~60):
  `return Boolean(user && accountAllowedInModuleMode(user) && (user.role === 'superadmin' || user.role === 'admin'))`
  → `return Boolean(user && (user.role === 'superadmin' || user.role === 'admin'))`
- Remove the `moduleFlags` import.

### 3.2 `server/utils/mfa/session.ts`

- Import line 3: `import { accountAllowedInModuleMode, getRequestAuthAccount, getSessionUser } from '../auth'` → `import { getRequestAuthAccount, getSessionUser } from '../auth'`
- Line ~68: `if (!account?.active || account.auth_epoch !== epoch || !accountAllowedInModuleMode(account)) return null` → `if (!account?.active || account.auth_epoch !== epoch) return null`

### 3.3 `server/api/auth/login.post.ts`

- Remove `accountAllowedInModuleMode` from the import on line 2. If it was the only import from that line, delete the line.
- Line ~60: `account?.active && /^[a-f0-9]{48}$/.test(account.auth_epoch) && accountAllowedInModuleMode(account) && passwordOk` → `account?.active && /^[a-f0-9]{48}$/.test(account.auth_epoch) && passwordOk`
- MFA: see §4.1 in this same file.

## 4. MFA always available

### 4.1 `server/api/auth/login.post.ts`

Line ~86 starts `if (__PB_MODULE_MFA__) {` and its block ends just before `await replaceUserSession(event, {` (line ~132). **Unwrap it:**

1. Delete the line `if (__PB_MODULE_MFA__) {`.
2. Delete its matching closing `}`, the one directly above the final `await replaceUserSession(...)`.
3. De-indent the body by two spaces.

Do not change anything inside the body: trusted devices, `setMfaPending`, enforcement.

### 4.2 Device APIs

In each of these files, delete the three-line guard:

```ts
  if (!__PB_MODULE_MFA__) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }
```

- `server/api/admin/auth/devices/list.get.ts`
- `server/api/admin/auth/devices/rename.post.ts`
- `server/api/admin/auth/devices/revoke.post.ts`
- `server/api/admin/auth/devices/revoke-all.post.ts`

Keep `requireAuthenticatedUser(event)` exactly as it is.

## 5. Security alerts

`server/utils/notify/security-alert.ts` (line ~94): delete

```ts
  if (!__PB_MODULE_SECURITY_ALERTS__) {
    return
  }
```

The following `settings.security_alerts_enabled` check stays.

## 6. Schema, boot and restore

### 6.1 `server/utils/schema.ts`

- Delete the exported `stripModuleSchemaSections` function.
- Replace `loadSchema` with:

  ```ts
  export async function loadSchema(): Promise<{ schema: string, hash: string }> {
    const schema = await readFile(resolve(process.cwd(), 'server/utils/schema.surql'), 'utf8')
    return { schema, hash: createHash('sha256').update(schema).digest('hex') }
  }
  ```

- Update the doc comment above `applySchema`: "Apply the current, module-filtered schema" → "Apply the current schema".
- **Do not edit `server/utils/schema.surql`.** The `-- #module ... start/end` lines are now ordinary SQL comments. Leaving them keeps the hash identical for existing installs (spec 00 §4 invariant 4).

### 6.2 `server/plugins/db-init.ts`

| Line (approx.) | Before | After |
|---|---|---|
| 14 | `import { getRuntimeModuleConfig, resolveModuleFlags } from '~/utils/moduleFlags'` | delete |
| 59 | `if (__PB_MODULE_ANALYTICS__) markAnalyticsReady()` | `markAnalyticsReady()` |
| 107–109 | `if (__PB_MODULE_ANALYTICS__) {` / `await bootStep('analytics-settings', ...)` / `}` | `await bootStep('analytics-settings', () => initializeAnalyticsSettings(true))` |
| 112–115 | `if (__PB_MODULE_LOGS__) {` + comment + `await bootStep('logging-settings-reload', ...)` + `}` | keep the comment and the `await bootStep(...)` line, unwrapped |
| 258 | `{ postId, versionId, hasVersioning: __PB_MODULE_POST_VERSIONING__ }` | `{ postId, versionId, hasVersioning: true }` |
| 468 | `if (__PB_MODULE_LOGS__ && resolveModuleFlags(getRuntimeModuleConfig()).errorLogs) {` | unwrap: keep the `try { await runErrorGroupBackfill(db) } catch ...` body, delete the `if` and its closing brace |

### 6.3 `server/utils/backups/restore.ts` (`refreshState`, lines ~50–56)

Before:

```ts
  await initializeRuntimeSettings(true)
  if (__PB_MODULE_ANALYTICS__) await initializeAnalyticsSettings(true)
  await initializeSecuritySettings(true)
  if (__PB_MODULE_LOGS__) await reloadLoggingSettings()
```

After:

```ts
  await initializeRuntimeSettings(true)
  await initializeAnalyticsSettings(true)
  await initializeSecuritySettings(true)
  await reloadLoggingSettings()
```

Touch nothing else in `restore.ts`.

## 7. Post versioning always on

### 7.1 `server/utils/blocks.ts`

- Line ~466: `if (__PB_MODULE_POST_VERSIONING__ && options.shouldSnapshot && changed && existing.length) {` → `if (options.shouldSnapshot && changed && existing.length) {`
- Lines ~512–514: delete

  ```ts
  if (!__PB_MODULE_POST_VERSIONING__) {
    await collapsePostToCurrentVersion(db, postId, currentVersionId, existing)
  }
  ```

- Delete the now-unused functions `collapsePostToCurrentVersion` (line ~519) and `export async function collapsePostVersionHistory` (line ~555). Then delete any helper that **only** they used, such as `loadBlockIdsForVersions`, but only after `rg -n "<helperName>" server` shows no other caller. If a helper is still used elsewhere, keep it.

### 7.2 `server/api/admin/posts/[id].put.ts`

- Remove `collapsePostVersionHistory,` from the import list (line ~12).
- Line ~52: `if (__PB_MODULE_POST_VERSIONING__ && !previousPost.has_versioning && payload.status === 'published') {` → `if (!previousPost.has_versioning && payload.status === 'published') {`
- Lines ~104–106: delete the branch

  ```ts
  } else if (!__PB_MODULE_POST_VERSIONING__) {
    await collapsePostVersionHistory(db, normalizedPost.id, previousBlocks)
  }
  ```

  Keep the closing `}` of the preceding `if (Object.prototype.hasOwnProperty.call(body, 'content_json')) { ... }` block.

### 7.3 `server/api/admin/posts/index.post.ts`

Line ~53: `has_versioning: __PB_MODULE_POST_VERSIONING__ && payload.status === 'published',` → `has_versioning: payload.status === 'published',`

## 8. Annotation endpoint

`server/api/admin/annotate.post.ts` (task FF-02):

- Delete the import `import { getRuntimeModuleConfig, isRuntimeEditorBlockEnabled } from '~/utils/moduleFlags'`.
- Delete:

  ```ts
  if (!isRuntimeEditorBlockEnabled(getRuntimeModuleConfig(), 'annotationBlock')) {
    throw createError({ statusCode: 404, message: 'Annotation module is disabled' })
  }
  ```

`requireContentManager(event)`, the 5,000-character limit and the zod validation stay.

## 9. Self-check after FF-03

```sh
rg -n "__PB_MODULE_|resolveModuleFlags|getRuntimeModuleConfig|accountAllowedInModuleMode|stripModuleSchemaSections|collapsePost|assertLogTypeEnabled|isGeoipEnabled" server
```

Expected output: only the five graph/heatmap guards that FF-04 replaces:

- `server/api/graph/overview.get.ts`
- `server/api/graph/cluster.get.ts`
- `server/api/graph/tag.get.ts`
- `server/api/graph/post/[slug].get.ts`
- `server/api/posts/publish-frequency.get.ts`

## 10. Graph and heatmap endpoints

### 10.1 Settings contract (`server/utils/settings.ts`)

1. Add the two keys at the **end** of `PUBLIC_SETTING_KEYS` (after `'footer_show_powered_by'`):

   ```ts
     'footer_show_powered_by',
     'graph_view_enabled',
     'publish_heatmap_enabled'
   ] as const
   ```

2. Add them to `interface PublicSiteSettings`:

   ```ts
     footer_show_powered_by: boolean
     graph_view_enabled: boolean
     publish_heatmap_enabled: boolean
   }
   ```

3. Add them to `normalizePublicSettings`:

   ```ts
       footer_show_powered_by: booleanValue(values.footer_show_powered_by, true),
       graph_view_enabled: booleanValue(values.graph_view_enabled, true),
       publish_heatmap_enabled: booleanValue(values.publish_heatmap_enabled, true)
     }
   ```

4. In `filterAdminSettings`, next to the existing `analytics_enabled` block, add:

   ```ts
     for (const key of ['graph_view_enabled', 'publish_heatmap_enabled'] as const) {
       if (key in filtered) {
         filtered[key] = booleanValue(filtered[key], true)
       }
     }
   ```

`booleanValue` is a module-private function in the same file (line ~557). Use it; do not create a second copy.

### 10.2 New helper `server/utils/publicFeatures.ts`

```ts
import { createError } from 'h3'
import { readPublicBootstrap } from './publicBootstrap'

export type PublicFeatureKey = 'graph_view_enabled' | 'publish_heatmap_enabled'

/**
 * Throws 404 when an administrator has turned an optional public feature off.
 * Reads the cached public bootstrap (30 s TTL, invalidated on settings save).
 */
export async function assertPublicFeatureEnabled(key: PublicFeatureKey): Promise<void> {
  const { settings } = await readPublicBootstrap()
  if (settings[key] === false) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
}
```

### 10.3 Replace the build guards

In each file, replace

```ts
  if (!__PB_MODULE_GRAPH_VIEW__) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
```

with

```ts
  await assertPublicFeatureEnabled('graph_view_enabled')
```

and add `import { assertPublicFeatureEnabled } from '<relative path>/utils/publicFeatures'`. Match the relative-import style already used in each file.

| File | Key |
|---|---|
| `server/api/graph/overview.get.ts` | `graph_view_enabled` |
| `server/api/graph/cluster.get.ts` | `graph_view_enabled` |
| `server/api/graph/tag.get.ts` | `graph_view_enabled` |
| `server/api/graph/post/[slug].get.ts` | `graph_view_enabled` |
| `server/api/posts/publish-frequency.get.ts` | `publish_heatmap_enabled` (replaces `__PB_MODULE_PUBLISH_ACTIVITY_HEATMAP__`) |

Each handler must already be `async`. If one is not, make it `async`. Keep the guard as the **first** statement, as today.
