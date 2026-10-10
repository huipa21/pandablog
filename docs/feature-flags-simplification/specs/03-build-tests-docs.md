# Spec 03: Build machinery, legacy warning, tests, harness and docs

**Approved target.** Tasks FF-01 (§5.1, first part), FF-03/FF-04 (§5.2, §5.3), FF-06 (§1–§4, §5.1 second part, §5.4) and FF-07 (§6–§7).

## 1. Files to delete (FF-06)

Delete these files only after FF-05's self-check passes:

```sh
git rm -q modules/feature-flags.ts \
  build/pandablog-modules.ts \
  types/pandablog-modules.ts \
  types/pandablog-modules.schema.json \
  types/module-flags.d.ts \
  utils/moduleFlags.ts \
  composables/useModuleFlags.ts \
  scripts/configure-modules.ts \
  scripts/configure/index.html \
  scripts/print-modules.ts \
  pandablog.modules.json \
  pandablog.modules.json.example
```

`git rm` stages the deletions. If the user prefers unstaged changes, use plain `rm` instead. Either way, **do not commit**. `components/admin/editor/DisabledDialogueBlockNodeView.vue` was already deleted in FF-02.

## 2. Small edits (FF-06)

### 2.1 `package.json`

Delete the two script entries:

```json
    "configure": "tsx scripts/configure-modules.ts",
    "modules:print": "tsx scripts/print-modules.ts",
```

Keep valid JSON (commas). Do not touch dependencies. `tsx` is still used elsewhere.

### 2.2 `.gitignore`

Delete these allow-list lines:

```text
!scripts/configure-modules.ts
!scripts/print-modules.ts
!scripts/configure/
!scripts/configure/index.html
!pandablog.modules.json.example
```

Also add allow-list entries for the new tests, because `tests/unit/*` is ignored by default: `!tests/unit/feature-flags-retired.test.ts`, `!tests/unit/legacy-module-manifest.test.ts`, `!tests/unit/public-features-settings.test.ts`.

### 2.3 `Dockerfile`

Delete the whole `RUN node -e "const { readFileSync, rmSync } = require('node:fs'); const BUNDLED = [...]; ..."` step, the one that reads `/app/pandablog.modules.json` and removes theme folders (lines ~85–89). Keep the `version.json` step before it and the `# ---------- Stage 2: runtime ----------` section after it. All themes copied by `cp -r themes /app/runtime/themes` remain.

### 2.4 `nuxt.config.ts`

In `runtimeConfig.public`, delete `modules: {}` and the comma that preceded it:

```ts
    public: {
      footerShowPoweredBy: parseEnvironmentBoolean(resolveEnvironment(
        'NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY', localEnv, process.env, 'false'
      ))
    }
```

## 3. Legacy manifest warning (FF-06, decision FF-D14)

### 3.1 `build/legacy-module-manifest.ts` (pure, unit-testable)

```ts
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const LEGACY_MODULE_MANIFEST = 'pandablog.modules.json'

const MAX_MANIFEST_BYTES = 256 * 1024
const MAX_DEPTH = 6
const MAX_REPORTED_PATHS = 100
/** Switches retired before this change; never reported. */
const IGNORED_PATHS = new Set(['modules.logs.accessLogs'])

/** Lists dotted paths whose value is exactly `false` (e.g. `modules.analytics.enabled`). */
export function listDisabledLegacyFlags(value: unknown, prefix = '', out: string[] = [], depth = 0): string[] {
  if (out.length >= MAX_REPORTED_PATHS || depth > MAX_DEPTH) return out
  if (value === false) {
    if (prefix && !IGNORED_PATHS.has(prefix)) out.push(prefix)
    return out
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!prefix && (key === '$schema' || key === 'version')) continue
    listDisabledLegacyFlags(child, prefix ? `${prefix}.${key}` : key, out, depth + 1)
  }
  return out
}

export type LegacyManifestReport =
  | { found: false }
  | { found: true, unreadable: boolean, disabled: string[] }

/** Never throws: the build must not fail because of a stale manifest. */
export function inspectLegacyModuleManifest(rootDir: string): LegacyManifestReport {
  const path = resolve(rootDir, LEGACY_MODULE_MANIFEST)
  if (!existsSync(path)) return { found: false }
  try {
    const text = readFileSync(path, 'utf8')
    if (text.length > MAX_MANIFEST_BYTES) return { found: true, unreadable: true, disabled: [] }
    return { found: true, unreadable: false, disabled: listDisabledLegacyFlags(JSON.parse(text)) }
  } catch {
    return { found: true, unreadable: true, disabled: [] }
  }
}

export function formatLegacyManifestWarning(report: Extract<LegacyManifestReport, { found: true }>): string {
  const lines = [`[pandablog] ${LEGACY_MODULE_MANIFEST} is no longer used. Every feature is built in and controlled from admin settings.`]
  if (report.unreadable) {
    lines.push('  The file could not be read as JSON; review it manually.')
  } else if (report.disabled.length) {
    lines.push('  Your manifest disabled:', ...report.disabled.map(path => `    - ${path}`))
    lines.push('  Review docs/feature-flags-simplification/operations.md before deploying this build.')
  }
  lines.push(`  Delete ${LEGACY_MODULE_MANIFEST} to silence this warning.`)
  return lines.join('\n')
}
```

### 3.2 `modules/legacy-module-manifest.ts` (Nuxt local module; auto-registered from `modules/`)

```ts
import { defineNuxtModule } from '@nuxt/kit'
import { formatLegacyManifestWarning, inspectLegacyModuleManifest } from '../build/legacy-module-manifest'

export default defineNuxtModule({
  meta: { name: 'pandablog-legacy-module-manifest' },
  setup(_options, nuxt) {
    const report = inspectLegacyModuleManifest(nuxt.options.rootDir)
    if (report.found) console.warn(formatLegacyManifestWarning(report))
  }
})
```

It **only** warns. It must not set defines, ignore patterns or runtime config. If it does any of those, it has turned back into a flag framework.

### 3.3 Test `tests/unit/legacy-module-manifest.test.ts`

Use `node:fs/promises` `mkdtemp` in `os.tmpdir()` to create an owned temporary directory. Never use the repo root. Cover:

1. No file → `{ found: false }`.
2. All-true manifest → `found: true`, `disabled: []`; the warning text says "no longer used" and does not say "disabled:".
3. `{ version: 1, modules: { analytics: { enabled: false }, users: { multiUser: false }, editor: { blocks: { mermaid: false } }, logs: { accessLogs: false } } }` → `disabled` equals `['modules.analytics.enabled', 'modules.users.multiUser', 'modules.editor.blocks.mermaid']` (accessLogs ignored).
4. Invalid JSON and a file larger than 256 KiB → `unreadable: true`, and no throw.
5. `listDisabledLegacyFlags` stops at 100 paths and at depth 6.

Remove the temporary directory in `afterEach`.

## 4. Self-check after FF-06

```sh
rg -n "__PB_|pandablog-modules|moduleFlags|useModuleFlags|feature-flags|configure-modules|print-modules|modules:print|public\.modules" \
  --glob '!docs/**' --glob '!node_modules/**' --glob '!.nuxt/**' --glob '!.output/**' .
```

Allowed output only:

- `tests/unit/feature-flags-retired.test.ts` (it contains the patterns it forbids)
- `scripts/backend-hardening/maintenance-app.ts` (`retiredSources` paths and the emitted-code regex, after FF-07)
- `tests/unit/*` lines that set `useRuntimeConfig` stubs, if you kept them (see §5.2)

Then run `npm run build` once **without** a manifest (no warning expected). Run it again after creating a temporary `pandablog.modules.json` with one `false` (warning expected, build succeeds). Delete the temporary manifest afterwards. Do not leave an untracked manifest in the repo.

## 5. Tests

### 5.1 New test `tests/unit/feature-flags-retired.test.ts`

**FF-01 version (renderer only):**

```ts
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('feature flags retired', () => {
  it('renders every block type regardless of authoring options', async () => {
    const source = await readFile('components/content/ContentRenderer.vue', 'utf8')
    expect(source).not.toMatch(/__PB_/)
    expect(source).not.toMatch(/disabledBlockTypes|isDisabledKnownBlock|disabled-content-block/)
    for (const component of ['NodeImage', 'NodeCodeBlock', 'NodeDiffBlock', 'NodeMermaid', 'NodeBlockMath', 'NodeRubyUnit', 'NodeInlineMath',
      'NodeAnnotationBlock', 'NodeCustomHtml', 'NodeVideoEmbed', 'NodeMediaText', 'NodeFilesBlock', 'NodeColumnsBlock', 'NodeTabsBlock',
      'NodeDialogueBlock', 'NodeAccordionBlock', 'NodeQuoteBlock', 'NodeFootnotesBlock']) {
      expect(source).toMatch(new RegExp(`const ${component} = defineAsyncComponent\\(`))
    }
  })
})
```

**FF-06 addition (repository-wide).** Add a second `it(...)` that walks these **production** paths and fails on any match:

- Paths: `components`, `composables`, `layouts`, `middleware`, `modules`, `pages`, `plugins`, `server`, `utils`, `types`, `build`, `nuxt.config.ts`, `Dockerfile`, `package.json`
- Patterns: `/__PB_(?:MODULE|BLOCK)_/`, `/utils\/moduleFlags|useModuleFlags|pandablog-modules/`, `/public\.modules/`
- Files: `.ts`, `.vue`, `.json`, `.mjs` and the two named root files. Use `readdir(dir, { recursive: true })` (Node 22). Skip `node_modules`.
- Also assert that these paths do **not** exist: `modules/feature-flags.ts`, `build/pandablog-modules.ts`, `utils/moduleFlags.ts`, `pandablog.modules.json`, `pandablog.modules.json.example`, `scripts/configure-modules.ts`.

Do not scan `tests/`, `docs/` or `scripts/backend-hardening/`; they legitimately mention retired names.

### 5.2 Update existing tests

These tests describe behavior that **no longer exists**, such as "logs module disabled → 404". Delete those cases. That removes tests of retired behavior; it does not weaken any. Keep every case that tests runtime settings, auth, bounds or security. Update each test in the **same task** that changes its code.

| Test file | Task | Change |
|---|---|---|
| `tests/unit/schema.test.ts` | FF-03 | Delete the `stripModuleSchemaSections` import and test, plus the case that stubs modules to `false` (~line 37). Keep and adjust "loads the real schema": `loadSchema()` returns the raw file and `hash === sha256(raw)`. Delete the `__PB_*` stubs |
| `tests/unit/error-groups-plugin.test.ts` | FF-03 | Delete the `mode === 'build'` / `logs` / `errorLogs:false` cases (~lines 24–25). Delete the `__PB_MODULE_LOGS__` stub |
| `tests/unit/log-retention-plugin.test.ts` | FF-03 | Delete the disabled-module cases (~lines 84–85) and the stub |
| `tests/unit/log-retention.test.ts` | FF-03 | Delete the module-flag cases (~lines 326–363: `{ [flag]: false }`, `mode === 'build'`, `activityLogs: false`). Keep the runtime-setting cases (`activity_log_enabled`/`error_log_enabled`) |
| `tests/unit/logging-error-hook.test.ts` | FF-03 | Delete the cases that set `__PB_MODULE_LOGS__` false or `modules.logs` (~lines 66–73) |
| `tests/unit/logging-error-capture.test.ts` | FF-03 | Delete the `errorLogs: false` case (~line 180) and the stub |
| `tests/unit/error-groups-api.test.ts` | FF-03 | Delete the "404 when error logs module disabled" case (~line 78) |
| `tests/unit/security-alerts-bounded.test.ts` | FF-03 | Delete the case with `__PB_MODULE_SECURITY_ALERTS__` false (~line 35) and the stub |
| `tests/unit/current-identity.test.ts` | FF-03 | Delete `vi.mock('../../utils/moduleFlags', ...)`, the `multi` state, and the case "single-user mode accepts only designated owner…" |
| `tests/unit/current-identity-http.test.ts` | FF-03 | Delete the moduleFlags mock, the `multi` state and the `state.multi = false` assertions (~line 62). Delete the `__PB_MODULE_MFA__` stub |
| `tests/unit/password-routes.test.ts` | FF-03 | Delete the moduleFlags mock and the `__PB_MODULE_MFA__: true` stub |
| `tests/unit/runtime-startup.test.ts`, `request-id.test.ts`, `error-groups-live.test.ts`, `logging-console-routing.test.ts`, `backup-restore-schema.test.ts`, `tests/integration/database-bootstrap.test.ts`, `tests/integration/backup-restore.test.ts` | FF-03 | Delete only the `__PB_*` `stubGlobal` lines/entries |
| `tests/unit/access-log-retirement.test.ts` | FF-06 | Delete the case that imports `build/pandablog-modules` (legacy `accessLogs` manifest). §3.3 now covers its intent. Delete `__PB_*` stubs |
| Any test with `useRuntimeConfig` stub `{ public: { modules: ... } }` | FF-03/FF-06 | Change it to `{ public: {} }`. Keep the stub itself: other code may read runtime config |

After each task, run `rg -n "__PB_|moduleFlags" tests`. By the end of FF-06 it must print nothing except `feature-flags-retired.test.ts`.

### 5.3 New test `tests/unit/public-features-settings.test.ts` (FF-04)

Follow the mocking pattern of `tests/unit/backup-settings.test.ts`: mock `server/utils/db`, `server/utils/users` and `server/utils/posts`, then import `server/utils/settings`. Cover:

1. `PUBLIC_SETTING_KEYS` contains `graph_view_enabled` and `publish_heatmap_enabled`.
2. `normalizePublicSettings({})` → both `true`; `{ graph_view_enabled: false }` → `false`; `{ publish_heatmap_enabled: 'no' }` → `true`.
3. `filterAdminSettings({ graph_view_enabled: false })` keeps `false`; `{ graph_view_enabled: 'false' }` → `true`; unknown keys are still dropped.
4. `assertPublicFeatureEnabled`: mock `server/utils/publicBootstrap` `readPublicBootstrap` → `{ settings: { graph_view_enabled: false } }` → rejects with `statusCode: 404`; with `true` or with the key absent → resolves.

### 5.4 Verification that no feature is lost

`npm run test:unit` must pass with the same or a higher count than the FF-00 baseline, minus only the deleted retired-behavior cases. Record the number of deleted cases per file in progress.md.

## 6. Harness (FF-07)

### 6.1 `scripts/backend-hardening/maintenance-app.ts`

1. `const profiles = new Set(['full', 'minimal', ...])` → `const profiles = new Set(['full'])`. Update the usage message to `--profile=full`.
2. Delete the block that builds `modules` and writes `pandablog.modules.json` (lines ~83–91, from `const modules: Record<string, unknown> = {}` to `await writeFile(storage.path('pandablog.modules.json'), ...)`).
3. **Keep** the source-copy filter `file === 'pandablog.modules.json'`. It stops a stale operator manifest from being copied.
4. Add every file deleted in FF-02/FF-06 to `retiredSources`, because the harness copies tracked files and the deletions are uncommitted:
   `'modules/feature-flags.ts', 'build/pandablog-modules.ts', 'types/pandablog-modules.ts', 'types/pandablog-modules.schema.json', 'types/module-flags.d.ts', 'utils/moduleFlags.ts', 'composables/useModuleFlags.ts', 'scripts/configure-modules.ts', 'scripts/configure/index.html', 'scripts/print-modules.ts', 'pandablog.modules.json.example', 'components/admin/editor/DisabledDialogueBlockNodeView.vue'`.
   `pandablog.modules.json` is already skipped by the filter.
5. Emitted-code scan: change the regex
   `/appendAccessLog|queryAccessLogs|migrateAccessLogs|__PB_MODULE_LOGS_ACCESS__/`
   to
   `/appendAccessLog|queryAccessLogs|migrateAccessLogs|__PB_(?:MODULE|BLOCK)_/`
   and update the error message to `'Retired access engine or feature-flag constant remains in emitted server code'`.
6. `if (!['minimal', 'no-observers', 'activity-only'].includes(profile)) { ... }` → unwrap: keep the body (the error-log correlation check always runs).
7. Wrap formerly profile-gated sections in plain `{ ... }` blocks instead of fully unwrapping them, to avoid `const` name collisions.
8. Add the new untracked files to the harness's explicit source-copy allow-list: `server/utils/publicFeatures.ts`, `build/legacy-module-manifest.ts`, `modules/legacy-module-manifest.ts` and the three new tests. Otherwise the owned typecheck cannot find them.
9. Add a public-feature HTTP check after setup succeeds, using the existing authenticated helpers in the file (the browser fixture already does an authenticated `POST /api/admin/settings` with an `Origin` header). Save `graph_view_enabled: false` and expect `GET /api/graph/overview` → 404. Save `true` and expect 200. Do the same with `publish_heatmap_enabled` and `/api/posts/publish-frequency`. If the HTTP part of the script has no authenticated session, put these checks in `maintenance-browser.ts` instead, where `page.request` is authenticated.

### 6.2 `scripts/backend-hardening/maintenance-browser.ts`

The profile is now always `full`:

- `if (input.profile !== 'minimal' && input.profile !== 'no-backups') {` → unwrap.
- `if (!['minimal', 'no-observers'].includes(input.profile)) {` → unwrap.

Keep the `profile` field in the input type; it is still logged as evidence.

## 7. Documentation (FF-07)

### 7.1 `Readme.md`

- Table of contents: remove `- [Optional features (modules)](#optional-features-modules)`.
- Commands table: remove the `npm run configure` and `npm run modules:print` rows.
- Replace the whole section `## Optional features (modules)` (from that heading up to the next `##` heading) with:

  ```markdown
  ## Optional features

  Every feature is included in every build. Optional behavior is controlled at runtime by a
  superadmin, without rebuilding:

  | Feature | Where to control it | Default |
  | --- | --- | --- |
  | Analytics collection | Settings → Analytics | Off |
  | GeoIP for analytics | Place `dbip-city-lite.mmdb` at `NUXT_GEOIP_DB_PATH` | Off until the file exists |
  | Security alerts | Settings → Security | Off |
  | Require MFA for admins | Settings → Security | Off |
  | Activity / error logging and retention | Dashboard → Logs → Settings | On |
  | Knowledge graph (widget and `/graph`) | Settings → General → Public features | On |
  | Publishing heatmap | Settings → General → Public features | On |
  | Post version history limit | Settings → Versioning | 20 snapshots |

  All editor blocks are always available, and **every block type always renders** on public
  pages. The former build-time manifest (`pandablog.modules.json`) and `npm run configure` were
  removed; a leftover manifest only produces a build warning. See
  [docs/feature-flags-simplification/operations.md](docs/feature-flags-simplification/operations.md).
  ```

  Before writing this, check the defaults against the code: `DEFAULT_ANALYTICS_SETTINGS`, `DEFAULT_SECURITY_SETTINGS`, the logging defaults and the versioning `snapshot_limit` default (20). Fix the table if the code differs.
- Docker section, step 1 "**Select modules** in pandablog.modules.json …": delete the step and renumber the following steps.
- Project-structure listing: remove the line `pandablog.modules.json             Optional-module manifest`. Add `modules/legacy-module-manifest.ts  Warns about a leftover pandablog.modules.json`.
- "How the database is initialized": change "is applied (module-aware)" to "is applied".
- Search afterwards: `rg -n "modules.json|configure|module-aware|modules:print" Readme.md`. Only unrelated hits (such as "configure runtime env") may remain.

### 7.2 Narrow cross-links in older docs (do not rewrite history)

Add one line at the top of each file:

- `docs/dialogue-block/operations.md`
- `docs/dialogue-block/specs/00-architecture.md`

The line:

```markdown
> **Superseded in part:** build-time block flags (`pandablog.modules.json`, `__PB_BLOCK_DIALOGUE_BLOCK__`) were removed by [feature-flags simplification](../feature-flags-simplification/plan.md); the dialogue block is always available and always renders.
```

Adjust the relative link depth for the `specs/` file (`../../feature-flags-simplification/plan.md`). Do not edit the old progress/evidence ledgers (`docs/access-log-simplification/*`, `docs/backup-simplification/progress.md`, `docs/logging/progress.md`). They are historical records.
