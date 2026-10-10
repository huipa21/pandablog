# Spec 00: Editor simplification architecture

**Implemented locally; final acceptance incomplete.** Tasks: [plan](../plan.md). Evidence and decisions: [progress](../progress.md). Read [images](./01-images.md), [presentation](./02-layout-and-presentation.md) and [state/existing content](./03-state-and-existing-content.md) together.

## 1. Ownership

- Document state describes content and bounded semantic presets.
- Shared block components/helpers own preset interpretation and visible markup.
- Site tokens own colours, typography and spacing defaults. Reuse `assets/css/main.css` and theme tokens; add only a small missing token if necessary. No generic design-settings engine or new admin theme configurator.
- Pinia owns the inserter-open boolean. The editor owns pending insertion positions/replacement ranges; those are not a second boolean or a reason to move all Tiptap state into Pinia.
- Editor-only selection/drag chrome may differ; the visible block must not. Follow the [block and responsive contract](../../../.github/copilot-instructions.md).

## 2. Source-confirmed baseline inventory

Baseline reviewed: `b42eba92ead19b3528a50c1105b81e1e2862ab97`. Recheck HEAD and callers before implementation; paths/line numbers are navigation hints, not a fixed patch recipe.

| Area | Current paths | Required work |
|---|---|---|
| Editor orchestration | `components/admin/editor/blocks/BlockEditor.vue` (3,049 lines), `stores/editor.ts`, `pages/admin/posts/[id].vue` | Single inserter state, close lifecycle, canonical attrs for picked/uploaded images and media |
| Settings/toolbar | `components/admin/editor/blocks/BlockSettings.vue` (2,207 lines), `components/admin/editor/BlockToolbar.vue` (1,548 lines), `blocks/DialogueSettings.vue` | Remove targeted controls/handlers; keep formatting/selection/dialog/character operations |
| Registry | `composables/useBlockRegistry.ts` | Preset defaults and truthful capabilities; no retired attrs on create |
| Images/media | `extensions/imageBlock.ts`, `extensions/mediaText.ts`, editor `ImageBlockNodeView.vue` / `MediaTextNodeView.vue`, public `NodeImage.vue` / `NodeMediaText.vue` | Presets, no free resize, automatic sources, shared interpretation |
| Columns | `extensions/columnsBlock.ts`, editor `ColumnsBlockNodeView.vue`, public `NodeColumnsBlock.vue` | Retire custom percentages/drag; preserve child repair and content operations |
| Appearance | `extensions/blockquoteEnhanced.ts`, `codeBlockEnhanced.ts`, `blockMath.ts`, `separator.ts`, `tabsBlock.ts`, `accordionBlock.ts`, `dialogueBlock.ts` and paired editor/public components | Site spacing/typography/colours; bounded structural styles only |
| Shared design | `assets/css/main.css`, `code-themes.css`, `dialogue-block.css`, `themes/*/tokens.json` / `theme.css` | Shared tokens; no duplicated public-only block overrides |
| Media delivery | `composables/useMediaUrl.ts`, `types/content.ts`, `server/utils/imageProcessor.ts`, `mediaServe.ts`, `mediaLibrary.ts` | Reuse metadata and current authorized endpoints; no storage/processor redesign |
| Persistence/rendering | `components/content/ContentRenderer.vue`, `RenderedBlockDiffSurface.vue`, `utils/renderedBlockDiff.ts`, post versions/import paths | Same normalization and rendering semantics across all entry points |
| Tests | `tests/e2e/all-blocks-parity.spec.ts`, `editor-public-visual-parity.spec.ts`, dialogue suites; local inserter/editor/code-settings suites | New preset/theme/close/round-trip coverage; replace obsolete assertions, do not weaken unrelated tests |

## 3. Evidence behind the change

Image settings store pixel widths alongside `displayPx`, and percentages alongside `displayPercent`. `BlockSettings.vue` derives conversion percentages relative to intrinsic width, while `ImageBlockNodeView.vue` dragging computes them relative to container width; public rendering uses container percentages. This source-confirmed mismatch motivates deleting overlapping modes, not just moving them into a helper.

Column custom proportions and media/text ratios can also be written by node-view dragging. Removing settings alone cannot simplify their state space. Code zoom can be written by inline block buttons as well as the sidebar.

`BlockEditor.vue:478–491` mirrors a local ref to the store via two watchers. The parent closes directly through store actions, bypassing child target cleanup. Consolidating the boolean is small and independent of the visual-policy decision.

These are source findings only. No application test, benchmark or runtime failure reproduction was performed for this documentation task.

## 4. Complexity and preservation rules

- Delete unused state, event listeners, conversion helpers, imports and styles once all consumers are accounted for. A compatibility normalizer may read retired attrs under the confirmed policy; active rendering must not carry all the old sizing/theme branches indefinitely.
- Share pure preset/normalization/source-selection logic. Do not force all block schemas into one generic configuration framework or extract components solely for line count.
- Preserve block text, marks, IDs, media refs, captions, author info, child order/count and functional options. Never drop an unknown node to make a new schema load.
- Keep code monospaced/syntax-highlighted, maths readable with valid KaTeX fonts, media authorization and private-cache behaviour unchanged.
- Preserve dialogue character identity and its existing content operations. Do not retire content blocks or resurrect feature flags.
- No new dependency removal just because an import in these components disappears. Inspect all other consumers first.
- No server-side bulk rewrite or schema/database migration is included. Existing-content policy is gated in spec 03.
