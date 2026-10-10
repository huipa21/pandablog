# Spec 02: Client recipes (renderer, editor, pages, settings UI)

**Approved target.** Tasks FF-01 (§1), FF-02 (§2), FF-04 (§3–§4) and FF-05 (§5). Apply the [replacement rule](../plan.md#3-what-always-on-means-for-code-the-replacement-rule). Line numbers refer to `d878a57` and are hints only.

Vue templates unwrap refs automatically. Inside `<script setup>`, use `.value` on computed refs.

## 1. Public renderer: `ContentRenderer.vue`

File: `components/content/ContentRenderer.vue` (task FF-01).

### 1.1 Script

Replace the block of conditional component definitions (lines ~38–76) with unconditional async components:

```ts
const NodeImage = defineAsyncComponent(() => import('./NodeImage.vue'))
const NodeCodeBlock = defineAsyncComponent(() => import('./NodeCodeBlock.vue'))
const NodeDiffBlock = defineAsyncComponent(() => import('./NodeDiffBlock.vue'))
const NodeMermaid = defineAsyncComponent(() => import('./NodeMermaid.vue'))
const NodeBlockMath = defineAsyncComponent(() => import('./NodeBlockMath.vue'))
const NodeRubyUnit = defineAsyncComponent(() => import('./NodeRubyUnit.vue'))
const NodeInlineMath = defineAsyncComponent(() => import('./NodeInlineMath.vue'))
const NodeAnnotationBlock = defineAsyncComponent(() => import('./NodeAnnotationBlock.vue'))
const NodeCustomHtml = defineAsyncComponent(() => import('./NodeCustomHtml.vue'))
const NodeVideoEmbed = defineAsyncComponent(() => import('./NodeVideoEmbed.vue'))
const NodeMediaText = defineAsyncComponent(() => import('./NodeMediaText.vue'))
const NodeFilesBlock = defineAsyncComponent(() => import('./NodeFilesBlock.vue'))
const NodeColumnsBlock = defineAsyncComponent(() => import('./NodeColumnsBlock.vue'))
const NodeTabsBlock = defineAsyncComponent(() => import('./NodeTabsBlock.vue'))
const NodeDialogueBlock = defineAsyncComponent(() => import('./NodeDialogueBlock.vue'))
const NodeAccordionBlock = defineAsyncComponent(() => import('./NodeAccordionBlock.vue'))
const NodeQuoteBlock = defineAsyncComponent(() => import('./NodeQuoteBlock.vue'))
const NodeFootnotesBlock = defineAsyncComponent(() => import('./NodeFootnotesBlock.vue'))
```

The components stay lazy (`defineAsyncComponent`), so heavy libraries such as Mermaid and KaTeX still load only when a post contains that block.

Delete all of the following:

- `const horizontalRuleEnabled = __PB_BLOCK_HORIZONTAL_RULE__`
- the whole `const disabledBlockTypes = new Set([...].filter(Boolean))`
- `const isDisabledKnownBlock = computed(...)`
- `const disabledBlockLabel = computed(...)`
- `const { t } = useI18n()`, but **only** if `t` has no other use in the file. Check with `rg -n "\bt\(" components/content/ContentRenderer.vue`.

### 1.2 Template

- `<hr v-else-if="horizontalRuleEnabled && node.type === 'horizontalRule'" ...>` → `<hr v-else-if="node.type === 'horizontalRule'" ...>`
- For every component line, remove the `Comp && ` prefix. Example:
  `<NodeImage v-else-if="NodeImage && node.type === 'image'" :node="node" />` → `<NodeImage v-else-if="node.type === 'image'" :node="node" />`.
  Do this for all 18 components.
- Delete the placeholder:

  ```vue
  <div v-else-if="isDisabledKnownBlock" class="disabled-content-block" role="note">
    {{ disabledBlockLabel }}
  </div>
  ```

### 1.3 Style

Delete the `.disabled-content-block { ... }` rule. If the `<style scoped>` block becomes empty, delete the whole `<style scoped></style>` element.

Self-check: `rg -n "__PB_|disabled|isDisabledKnownBlock" components/content/ContentRenderer.vue` prints nothing.

## 2. Editor

### 2.1 `composables/useBlockRegistry.ts`

Delete `const optionalBlockEnabled: Record<string, boolean> = { ... }` (lines ~401–420) and `function isBlockEnabled(...)` (lines ~422–424). Replace

```ts
const enabledBlockDefinitions = blockDefinitions.filter((block) => isBlockEnabled(block.name))
```

with

```ts
const enabledBlockDefinitions = blockDefinitions
```

Keep the name `enabledBlockDefinitions` to keep the diff small. `visibleBlockDefinitions` (which filters `hidden`) stays.

### 2.2 `components/admin/editor/blocks/BlockEditor.vue`

1. Loaders (lines ~297–380): delete the first line of each loader:
   - `if (!__PB_BLOCK_CODE_BLOCK__) return []` in `loadCodeBlockExtensions`
   - `if (!__PB_BLOCK_MERMAID__) return []` in `loadMermaidExtensions`
   - `if (!__PB_BLOCK_BLOCK_MATH__) return []` in `loadBlockMathExtensions`
   - `if (!__PB_BLOCK_INLINE_MATH__) return []` in `loadInlineMathExtensions`
   - `if (!__PB_BLOCK_ANNOTATION_BLOCK__) return []` in `loadAnnotationExtensions`
2. Extension list (lines ~527–683). Convert every conditional spread into plain entries:
   - `...(__PB_BLOCK_HORIZONTAL_RULE__ ? [SeparatorNode] : []),` → `SeparatorNode,`
   - `...(__PB_BLOCK_DIFF_BLOCK__ ? [DiffBlockNode.extend({...})] : []),` → `DiffBlockNode.extend({...}),`
   - Do the same for `__PB_BLOCK_CUSTOM_HTML__`, `VIDEO_EMBED`, `IMAGE`, `MEDIA_TEXT`, `FILES_BLOCK`, `BLOCKQUOTE` (each wraps one `.extend(...)` element).
   - Two-element arrays (`COLUMNS_BLOCK`, `TABS_BLOCK`, `ACCORDION_BLOCK`): `...(FLAG ? [A.extend(...), B.extend(...)] : []),` → `A.extend(...), B.extend(...),`
   - `TABLE`: `...(__PB_BLOCK_TABLE__ ? [Table.configure({...}), TableRow, TableHeader, TableCell] : []),` → `Table.configure({...}), TableRow, TableHeader, TableCell,`
   - `FOOTNOTES_BLOCK` (two places): `...(__PB_BLOCK_FOOTNOTES_BLOCK__ ? [Footnote] : []),` → `Footnote,` and `...(__PB_BLOCK_FOOTNOTES_BLOCK__ ? [FootnotesBlockNode] : []),` → `FootnotesBlockNode,`. **Keep their original positions** (`ListItemEnhanced` stays between them). Extension order matters in Tiptap.
   - `DIALOGUE_BLOCK`: keep only the enabled branch:

     ```ts
     DialogueBlockNode.configure({ characterNames: [t('admin.editor.dialogue.characterA'), t('admin.editor.dialogue.characterB')] }).extend({ addNodeView() { return VueNodeViewRenderer(DialogueBlockNodeView) } }),
     DialogueLineNode.extend({ addNodeView() { return VueNodeViewRenderer(DialogueLineNodeView) } }),
     ```

     Delete the whole `: [ // Keep the schema when disabled ... ]` fallback.
3. Delete the import `import DisabledDialogueBlockNodeView from '~/components/admin/editor/DisabledDialogueBlockNodeView.vue'` (line ~249).
4. `runTransform` (line ~1236): `case 'dialogueBlock': if (__PB_BLOCK_DIALOGUE_BLOCK__) chain.convertParagraphsToDialogue().run(); break` → `case 'dialogueBlock': chain.convertParagraphsToDialogue().run(); break`
5. Self-check: `rg -n "__PB_" components/admin/editor/blocks/BlockEditor.vue` prints nothing. Count brackets carefully. `npm run typecheck` and `npm run lint` catch most mistakes.

### 2.3 Delete the disabled dialogue view

- Delete the file `components/admin/editor/DisabledDialogueBlockNodeView.vue`.
- Delete the key `admin.editor.dialogue.disabled` from `i18n/locales/en.json` (`"Disabled content block: dialogueBlock"`) and `i18n/locales/zh-CN.json` (`"已禁用的内容块：dialogueBlock"`). Keep valid JSON: fix the trailing comma on the previous line (`"cancel": "Cancel"` / its zh-CN equivalent).
- Check: `rg -n "dialogue.disabled|DisabledDialogue" --glob '!docs/**' .` prints nothing.

### 2.4 `components/admin/editor/BlockToolbar.vue` (line ~577)

```ts
...(__PB_BLOCK_DIALOGUE_BLOCK__ ? [{ label: t('admin.editor.dialogue.convert'), icon: 'i-lucide-message-square-quote', onSelect: () => emit('transform', 'dialogueBlock') }] : [])
```

→

```ts
{ label: t('admin.editor.dialogue.convert'), icon: 'i-lucide-message-square-quote', onSelect: () => emit('transform', 'dialogueBlock') }
```

Keep the surrounding array punctuation valid.

### 2.5 `components/admin/editor/blocks/BlockSettings.vue`

- Delete `const dialogueEnabled = __PB_BLOCK_DIALOGUE_BLOCK__` (line ~818).
- Line ~470: `v-if="blockName === 'dialogueBlock' && dialogueEnabled"` → `v-if="blockName === 'dialogueBlock'"`

### 2.6 `components/admin/editor/PostSettingsModal.vue`

- Delete `const relatedPostsEnabled = __PB_BLOCK_RELATED_POST__` (line ~219).
- Lines ~128 and ~186: delete the `v-if="relatedPostsEnabled"` attribute.
- Line ~268: `if (!relatedPostsEnabled || isCurrentPost(post) || hasRelatedPost(post)) {` → `if (isCurrentPost(post) || hasRelatedPost(post)) {`

## 3. Public pages: graph and heatmap

Task FF-04. The server part is in [spec 01 §10](./01-server-recipes.md#10-graph-and-heatmap-endpoints).

### 3.1 `composables/useSiteSettings.ts`

1. Add to `interface SiteSettings`:

   ```ts
     graph_view_enabled: boolean
     publish_heatmap_enabled: boolean
   ```

2. Add to the `fallback` object: `graph_view_enabled: true,` and `publish_heatmap_enabled: true,`
3. Add to the `settings` computed:

   ```ts
         graph_view_enabled: booleanValue(remote.graph_view_enabled, fallback.value.graph_view_enabled),
         publish_heatmap_enabled: booleanValue(remote.publish_heatmap_enabled, fallback.value.publish_heatmap_enabled),
   ```

4. Add to the returned object:

   ```ts
       graphViewEnabled: computed(() => settings.value.graph_view_enabled),
       publishHeatmapEnabled: computed(() => settings.value.publish_heatmap_enabled),
   ```

### 3.2 `pages/index.vue`

- Line ~72: `const { siteName } = useSiteSettings()` → `const { siteName, graphViewEnabled, publishHeatmapEnabled } = useSiteSettings()`
- Delete `const graphEnabled = __PB_MODULE_GRAPH_VIEW__` and `const heatmapEnabled = __PB_MODULE_PUBLISH_ACTIVITY_HEATMAP__`.
- Template: `<BlogGraphOverviewWidget v-if="graphEnabled" />` → `<BlogGraphOverviewWidget v-if="graphViewEnabled" />`; `<BlogPublishFrequencyHeatmap v-if="heatmapEnabled" class="order-1" />` → `<BlogPublishFrequencyHeatmap v-if="publishHeatmapEnabled" class="order-1" />`

### 3.3 `pages/blog/[slug].vue`

- Replace `const graphEnabled = __PB_MODULE_GRAPH_VIEW__` (line ~53) with `const { graphViewEnabled } = useSiteSettings()`.
- Template line ~8: `v-if="graphEnabled"` → `v-if="graphViewEnabled"`.
- If the page already calls `useSiteSettings()`, add `graphViewEnabled` to that existing destructuring instead of calling it twice.

### 3.4 `pages/graph.vue`

This page uses `layout: false`, so the default layout has not loaded the bootstrap. Replace

```ts
if (!__PB_MODULE_GRAPH_VIEW__) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}
```

with

```ts
// layout: false, so load the public bootstrap before reading the setting.
await usePublicBootstrap()
const { graphViewEnabled } = useSiteSettings()
if (!graphViewEnabled.value) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found', fatal: true })
}
```

Keep it directly after `definePageMeta(...)`, where the old check was.

## 4. General settings UI: "Public features"

File: `pages/admin/settings/general.vue` (task FF-04). Follow the existing `USwitch` pattern used in `pages/admin/settings/profile.vue` (`owner_bio_visible`).

1. `interface GeneralSettingsForm`: add `graph_view_enabled: boolean` and `publish_heatmap_enabled: boolean`.
2. `const form = reactive<GeneralSettingsForm>({ ... })`: add `graph_view_enabled: true,` and `publish_heatmap_enabled: true,`
3. In `watch(data, ...)` (line ~330): add

   ```ts
     form.graph_view_enabled = settings.graph_view_enabled !== false
     form.publish_heatmap_enabled = settings.publish_heatmap_enabled !== false
   ```

4. In `save()` → `settingsBody` (line ~376): add `graph_view_enabled: form.graph_view_enabled,` and `publish_heatmap_enabled: form.publish_heatmap_enabled,`
5. Template: add a new `<section>` immediately **before** the "visibilityTitle" section, using the same card classes:

   ```vue
   <section class="grid gap-5 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
     <div>
       <h2 class="text-xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('admin.settings.general.publicFeaturesTitle') }}</h2>
       <p class="mt-1 text-sm text-[var(--pb-text-muted)]">{{ t('admin.settings.general.publicFeaturesDescription') }}</p>
     </div>

     <fieldset class="grid gap-3">
       <label class="flex cursor-pointer items-center justify-between gap-4 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3 text-sm">
         <span class="grid gap-1">
           <span class="font-medium text-[var(--pb-text)]">{{ t('admin.settings.general.graphView') }}</span>
           <span class="text-xs text-[var(--pb-text-muted)]">{{ t('admin.settings.general.graphViewHelp') }}</span>
         </span>
         <USwitch v-model="form.graph_view_enabled" />
       </label>

       <label class="flex cursor-pointer items-center justify-between gap-4 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3 text-sm">
         <span class="grid gap-1">
           <span class="font-medium text-[var(--pb-text)]">{{ t('admin.settings.general.publishHeatmap') }}</span>
           <span class="text-xs text-[var(--pb-text-muted)]">{{ t('admin.settings.general.publishHeatmapHelp') }}</span>
         </span>
         <USwitch v-model="form.publish_heatmap_enabled" />
       </label>
     </fieldset>
   </section>
   ```

   Use only existing `--pb-*` tokens. `npm run lint` runs the style-drift check.

6. Locales: add these keys inside `admin.settings.general` in both files. Put them after `adminDisplayDescription` and keep valid JSON.

   | Key | en | zh-CN |
   |---|---|---|
   | `publicFeaturesTitle` | `Public features` | `公开功能` |
   | `publicFeaturesDescription` | `Choose which optional widgets visitors can see. Changes may take up to two minutes to appear on cached pages.` | `选择访客可以看到哪些可选组件。已缓存的页面可能需要最多两分钟才会显示更改。` |
   | `graphView` | `Knowledge graph` | `知识图谱` |
   | `graphViewHelp` | `Show the graph widget on the home page and posts, and enable the /graph page.` | `在首页和文章中显示图谱组件，并启用 /graph 页面。` |
   | `publishHeatmap` | `Publishing heatmap` | `发布热力图` |
   | `publishHeatmapHelp` | `Show the publishing activity heatmap on the home page.` | `在首页显示发布活动热力图。` |

## 5. Admin layout, middleware and pages

Task FF-05.

### 5.1 `layouts/admin.vue`

1. Delete these lines (~205–208):

   ```ts
   const moduleFlags = useModuleFlags()
   const analyticsModuleEnabled = moduleFlags.analytics
   const multiUserModeEnabled = moduleFlags.multiUser
   const userManagementEnabled = multiUserModeEnabled
   ```

2. `adminRole` computed: delete the single-user branch

   ```ts
     if (!multiUserModeEnabled && authSession.value?.loggedIn) {
       return 'superadmin'
     }
   ```

   so it becomes `const adminRole = computed<AdminRole | null>(() => authSession.value?.user?.role ?? null)`. A multi-line body that returns the same value is also fine.
3. Nav sections:
   - `if (userManagementEnabled && (adminRole.value === 'superadmin' || adminRole.value === 'admin')) {` → `if (adminRole.value === 'superadmin' || adminRole.value === 'admin') {`
   - `...(moduleFlags.themes ? [{ to: '/admin/settings/themes', ... }] : []),` → `{ to: '/admin/settings/themes', label: t('admin.nav.themes'), icon: 'i-lucide-palette' },`
   - Do the same for `analyticsModuleEnabled` (analytics settings item) and `moduleFlags.securityAlerts || moduleFlags.mfa` (security item).
   - `if (moduleFlags.backups) { sections.push({...}) }` → unwrap: keep `sections.push({...})`. It stays inside the existing `if (adminRole.value === 'superadmin')` block.
4. Search the rest of the file for `analyticsModuleEnabled`, `multiUserModeEnabled`, `userManagementEnabled` and `moduleFlags`, and apply the replacement rule to each hit.

### 5.2 `middleware/admin.global.ts`

Delete the import (line 1) and these lines (~42–45):

```ts
  const multiUserModeEnabled = resolveModuleFlags(getRuntimeModuleConfig()).multiUser
  if (!multiUserModeEnabled) {
    return
  }
```

The role redirects below now always run. This is the normal multi-user behavior. The built-in `admin` owner is a superadmin and is unaffected.

### 5.3 Dashboard pages

- `pages/admin/dashboard/index.vue`: delete `const moduleFlags = useModuleFlags()`. `v-if="isSuperadmin && moduleFlags.analytics"` → `v-if="isSuperadmin"`; `v-if="isSuperadmin && moduleFlags.logs"` → `v-if="isSuperadmin"`.
- `pages/admin/dashboard/logs/index.vue`: delete `const moduleFlags = useModuleFlags()`. Delete `v-if="moduleFlags.activityLogs"` and `v-if="moduleFlags.errorLogs"` (lines ~17, 21, 31). Line ~72: `() => moduleFlags.errorLogs ? sessionFetch('/api/admin/logs/error-groups', {...}) : Promise.resolve({ rows: [] })` → `() => sessionFetch('/api/admin/logs/error-groups', {...})`.

### 5.4 `pages/admin/settings/security.vue`

- Delete `const mfaModuleEnabled = __PB_MODULE_MFA__` and `const securityAlertsModuleEnabled = __PB_MODULE_SECURITY_ALERTS__` (lines ~258–259).
- Delete `v-if="securityAlertsModuleEnabled"` (lines ~19, 54), `v-if="mfaModuleEnabled"` (lines ~82, 100) and `v-if="securityAlertsModuleEnabled || mfaModuleEnabled"` (line ~94).
- In `save()` (lines ~286–295), replace the two conditional spreads with plain properties:

  ```ts
  body: {
    security_alerts_enabled: form.security_alerts_enabled,
    security_alert_webhook_url: form.security_alert_webhook_url.trim(),
    security_alert_on_failed_login: form.security_alert_on_failed_login,
    security_alert_on_lockout: form.security_alert_on_lockout,
    security_alert_on_new_login: form.security_alert_on_new_login,
    security_mfa_required_for_admins: form.security_mfa_required_for_admins
  }
  ```

- `onMounted` (line ~443): `if (mfaModuleEnabled) { void loadMfaStatus() }` → `void loadMfaStatus()`.

### 5.5 `pages/login.vue`

- Delete `const mfaModuleEnabled = __PB_MODULE_MFA__` (line ~142).
- `v-else-if="mfaModuleEnabled && step === 'mfa'"` → `v-else-if="step === 'mfa'"`. Do the same for `'enroll'` and `'enroll-codes'` (lines ~41, 73, 111).
- `if (mfaModuleEnabled && response.mfa_required)` → `if (response.mfa_required)`; `if (mfaModuleEnabled && response.mfa_enrollment_required)` → `if (response.mfa_enrollment_required)` (lines ~183, 188).

### 5.6 Post versioning UI

- `pages/admin/posts/index.vue`: delete `const postVersioningEnabled = __PB_MODULE_POST_VERSIONING__` (line ~487) and the `v-if="postVersioningEnabled"` on the versioning settings button (line ~20).
- `pages/admin/posts/[id].vue`:
  - delete `const postVersioningEnabled = __PB_MODULE_POST_VERSIONING__` (line ~310)
  - delete `v-if="postVersioningEnabled"` on the history button (line ~35) and on the `UModal` (line ~253)
  - `:mode="postVersioningEnabled ? rightPaneMode : 'settings'"` → `:mode="rightPaneMode"` (line ~147)
  - delete every `if (!postVersioningEnabled) return` line (in `openVersionHistory`, `selectVersion`, `showVersionDiff`, `restoreSelectedVersion`, `deleteSelectedVersion`)
  - in `loadVersions`, delete the block `if (!postVersioningEnabled) { versions.value = []; return }`
- `components/admin/editor/EditorSidebar.vue`: delete `const postVersioningEnabled = __PB_MODULE_POST_VERSIONING__`; `v-if="postVersioningEnabled && mode === 'versions'"` → `v-if="mode === 'versions'"`.

### 5.7 Self-check after FF-05

```sh
rg -n "__PB_|useModuleFlags|moduleFlags|resolveModuleFlags|getRuntimeModuleConfig" pages layouts middleware components composables server utils plugins
```

Expected output: only `utils/moduleFlags.ts` and `composables/useModuleFlags.ts`. FF-06 deletes both.
