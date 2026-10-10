# Spec 03: Inserter state and existing content

**Implemented locally; full-app acceptance incomplete.** Applies to ES-01–05 in [plan](../plan.md). Section 1 records the state contract; section 2 is the **user-confirmed ES-D08 policy**. No bulk post/history rewrite or deployment is authorized. Evidence: [progress](../progress.md).

## 1. One inserter-open source; local insertion targets

Current `BlockEditor.vue:478–491` has `const inserterOpen = ref(false)` and two watchers copying between that ref and `editorStore.inserterOpen`. Replace it with:

```ts
import { storeToRefs } from 'pinia'

// After obtaining editorStore:
const { inserterOpen } = storeToRefs(editorStore)
```

Delete the local boolean and both synchronization watchers. Existing `inserterOpen.value` writes/template bindings can remain; existing store `openInserter()`/`closeInserter()` actions remain. Do not destructure the reactive store directly without `storeToRefs`, replace Pinia, or remove `@pinia/nuxt`.

Preserve the separation:

- Open state belongs to Pinia and is immediately visible to the parent layout/mobile panel.
- `insertAfterPos`, `insertReplaceRange` and pending media positions belong to the particular editor; do not mirror them into the store as another synchronization system.
- The + button may target a block/end or replace an empty paragraph. Untargeted opens clear old targets. A pick captures the valid target before closing clears it.

**Close lifecycle regression:** parent panel close and mobile swipe call store actions directly. Today these bypass the child `closeInserter()` target reset. Explicitly clear targets when the shared state closes, whichever entry point caused it. A **one-way cleanup watcher** on the store-backed ref is acceptable: it performs cleanup and does not maintain a second boolean. Alternatively funnel closes through one owner. Account for close+reopen in the same tick so a scheduled watcher cannot retain or erase the wrong target; use synchronous cleanup or an equivalent tested design.

Define/reset editor-owned state on unmount/post navigation; avoid stale open/selected/target state leaking into a new post. Do not accidentally close a successor editor from an old async callback. Recheck actual mount lifetime rather than adding broad store resets for unrelated consumers.

Required cases: initial store already open, child + open, exposed untargeted open, parent/mobile open/close/swipe, cancel, pick, external close/reopen, route/post change and target-preserving insertion. No mirror watcher or local boolean is reintroduced to pass a test.

## 2. ES-D08: confirmed existing-content policy

### User-confirmed decision

> May existing custom presentation be normalized to the new presets/site defaults when content is loaded/rendered, with only the canonical attrs written on the next ordinary save, and no bulk database/version rewrite?

The user confirmed **yes**. Retaining every legacy sizing/theme renderer indefinitely defeats the simplification. Consequence: old custom pixel sizes, distorted aspect ratios, colours, fonts, spacing and manual splits will no longer look exactly as they did. This is a visual/serialized-format change, not deletion of text/media content.

If exact old appearance is required, stop and revise scope. An explicit legacy rendering mode is additional maintenance cost and must not be quietly introduced as hidden Advanced behaviour. Do not apply the recommendation to real saved data before confirmation and implementation delegation.

### Normalization contract

A small pure, deterministic and idempotent normalizer reads legacy attrs before Tiptap schema loading and before public/diff rendering. It returns a new value without mutating API input/history objects. It is an import boundary, not an active second layout system or a boot migration.

| Legacy input | Proposed canonical result |
|---|---|
| Valid new image/layout preset | Preserve it; it takes precedence over stale legacy attrs |
| Explicit image custom-percent mode, or old width percentage without a display mode | Nearest Small/Medium/Full fraction of containing width; clamp safely; tie chooses the larger preset |
| Image custom-px, natural, fill-container, viewport/full-bleed, missing/invalid mode | Full; pixel/intrinsic dimensions cannot reliably infer a container fraction |
| Legacy `lockAspect: false`/fixed display height | Preserve source but render original proportional aspect ratio |
| Two-column valid custom percentages or ratios/proportions | Nearest 1:1 / 2:1 / 1:2 physical split; tie chooses Equal |
| Three through six columns with manual/proportion attrs | Equal; preserve all children/order/headers |
| Media/text legacy ratio | Map to physical left/right first using media position, then nearest split |
| Quote valid `bar`/`marks` | Preserve structural style; remove per-quote typography/colours |
| Arbitrary spacing, code theme/zoom, maths theme/font/scale, tabs/accordion decorative attrs, separator colour/thickness | Site defaults; retain functional/content attrs |
| Missing, malformed, nonfinite or unsupported retired values | Safe default; no CSS/URL evaluation or container measurement |

For percentage conversion, use `displayPercent` when valid with custom-percent mode, otherwise valid legacy `widthPercent`; media fields use the same rule. Unknown **new** preset names default safely and are not interpreted as arbitrary CSS. Source URLs, intrinsic metadata and unrelated attrs are not rewritten by these rules.

Normalize only the enumerated block/attr pairs. Preserve block IDs, text, marks, captions, source/media refs, attribution, child counts/order, character identity and functional options. Preserve unknown nodes/attrs for unchanged types; do not silently erase unsupported content during schema loading. Never normalize `mediaSize` file-byte metadata as a display size.

### Entry points and persistence

- Normalize editor model input before new schema hydration, including restored versions and pasted/imported HTML/JSON; otherwise removed schema attrs may disappear before they can be mapped.
- Public rendering, previews and rendered diffs must use the same effective mapping, not independently guessed defaults. Historical versions remain stored unchanged; their rendered presentation follows the new site rules.
- New create/update/export paths emit canonical active attrs only. Normal reads must not trigger a database write, autosave or new version solely because normalization occurred. An explicit ordinary edit/save can persist normalized attrs; record exact save/version behaviour and test it.
- Site-theme changes affect rendering without rewriting posts or creating versions.
- No startup scan, bulk post/version rewrite, new migration marker, arbitrary SQL or backup conversion. Test with generated fixtures, never the user's records.
- Include nested blocks and unknown/invalid legacy values; normalization is idempotent and bounded by existing content limits. Do not increase limits or add an unbounded recursive repair loop.

## 3. Rollback boundary

Before any rollout, obtain an independently verified backup through existing procedures and preview representative old custom posts on an approved isolated copy. Code rollback cannot recover removed visual attrs from a post saved canonically after upgrade; older untouched versions/backups may be needed. No automatic downgrade converter or real-data restore is authorized here.

The prior [block contract](../../../.github/copilot-instructions.md) permits retiring legacy variants; it does not itself grant this documentation session permission to mutate saved posts, deploy or decide the user's appearance-preservation policy.
