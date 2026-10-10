# Dialogue block: architecture

> **Superseded in part:** build-time block flags (`pandablog.modules.json`, `__PB_BLOCK_DIALOGUE_BLOCK__`) were removed by [feature-flags simplification](../../feature-flags-simplification/plan.md); the dialogue block is always available and always renders.

## 1. Problem

Roleplay and scene dialogue is currently written as one paragraph per line (`Maya: ...`). It reads like an article, not a conversation. Speaker names are plain text, so they cannot be styled, renamed or recoloured consistently.

## 2. Goals

- A dedicated Tiptap block for scenes: speaker column + line column, plus narration and thought lines.
- The speaker is structural metadata, never typed into the line text.
- Fast keyboard entry for long scenes.
- WYSIWYG parity: editor DOM equals public DOM (see the block contract in `.github/copilot-instructions.md`).
- Feature-flagged like every other block (`pandablog.modules.json`).

## 3. Non-goals

- Post-wide or site-wide character library. Characters are per block; promoting them later is a data migration.
- Emotion/expression attributes, character profiles, dialogue search or statistics.
- Chat-bubble / messaging UI. No speech bubbles.
- Auto-converting pasted scripts outside a dialogue block (only the explicit convert command).

## 4. Target design

- Nodes: `dialogueBlock` (container) > `dialogueLine`+ (inline content). See [01-data-model](./01-data-model.md).
- Editor: Vue NodeViews via `VueNodeViewRenderer`; editor chrome only on hover/focus. See [02-editor-ux](./02-editor-ux.md).
- Public: `components/content/NodeDialogueBlock.vue`, lazy-loaded in `ContentRenderer.vue`. See [03-public-rendering](./03-public-rendering.md).
- One shared stylesheet `assets/css/dialogue-block.css`, imported by both surfaces.
- Template to copy: the accordion block (`extensions/accordionBlock.ts`, `AccordionBlockNodeView.vue`, `NodeAccordionBlock.vue`).

## 5. Cross-cutting rules

- Same root class `dialogue-block` and the same child classes on both surfaces.
- Styles read `:root` tokens; no structural rules in `themes/*/theme.css`.
- All user-supplied attributes (colour, avatar src, names) are normalized on parse and by an `appendTransaction` repair plugin. Colours written into `style` must pass a strict palette / `#rrggbb` check.
- Avatar `src` must be a media-library URL (same rules as the image block); never arbitrary URLs.
- User-facing strings exist in both `i18n/locales/en.json` and `i18n/locales/zh-CN.json`.
- No viewport horizontal overflow at 360px or 768px.
