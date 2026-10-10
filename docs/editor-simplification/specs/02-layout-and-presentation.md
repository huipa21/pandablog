# Spec 02: Layout presets and site-owned presentation

**Implemented locally; full-app acceptance incomplete.** Applies to ES-04 in [plan](../plan.md). Read [architecture](./00-architecture.md) and [existing-content policy](./03-state-and-existing-content.md). Verification: C1–C7 and D1–D4 in [acceptance](../acceptance-test.md).

## 1. Columns and split media

Recommended canonical attr: `layoutPreset: 'equal' | 'wider-left' | 'wider-right'`.

| Structure | Choices | Baseline |
|---|---|---|
| Two columns | Equal / Wider left / Wider right | 1:1 / 2:1 / 1:2 |
| Three through six columns | Equal only | Equal fractions |
| Media/text | Equal / Wider left / Wider right | Same physical left/right ratios |

- Delete manual/custom-percentage option, drag boundary overlays/listeners and free ratio sliders. Presets must not be converted back into persisted custom percentages.
- Retire active `proportions`/`customPercentages` and media/text `ratio` under the confirmed existing-content policy. Use a small shared mapping for new layout attrs, no generic layout builder.
- Wider left/right describe the **visible physical sides**. If media is on the right, map the preset to the appropriate media fraction; test switching media position. Do not make the label secretly mean wider media.
- Retain column count 2–6, order/drag reorder, add/remove, headers and nested content. Column removal/count reduction must retain existing content-preserving merge behaviour; removing resize dragging is not removing content-reorder dragging.
- Switching from two to more columns normalizes layout to Equal without losing content. Going back to two has a deterministic Equal default, not hidden remembered manual proportions.
- Multi-column/media layouts stack at/below 48rem on both surfaces, with no viewport overflow. Keep existing supported width choices for non-image blocks; do not modify page container rules here.

## 2. Spacing belongs to the site

Remove author-controlled outer margins, padding and column gaps across touched block types, including:

- Columns: `columnGap`, `marginTop`, `marginBottom` inputs/attrs/styles.
- Accordions and dialogue: `marginTop`/`marginBottom` inputs and inline style writes.
- Block maths: `paddingX`/`paddingY` inputs/attrs.
- Separators: `marginY` input/attr.
- Registry `supports.spacing` declarations and any shared spacing UI that would still offer retired controls.

Use the existing site's spacing scale (`--space-*` with shared fallbacks) and block-specific tokens where needed. One global rule need not give a code block and a quote identical internal padding; it must give them **consistent defaults without per-post arbitrary values**. Prefer existing tokens; add a small shared block-space token only where no suitable contract exists.

Make visible spacing shared rather than independently hardcoded in editor/public components. Preserve sensible first/last-child spacing in nested containers. Do not fix parity by moving block styles into `themes/default/theme.css` or by adding broad `!important` selectors. Keep code gutter/line-height metrics synchronized.

## 3. Quotes

- Keep Bar (`bar`) and Quotation marks (`marks`), with Bar default. Use existing named structural styles; no arbitrary CSS style editor.
- Remove theme-colour palette/custom hex, font family/size, text colour and background colour controls. Retire `theme`, `fontFamily`, `fontSize`, `fontColor`, `backgroundColor` as active quote attrs under the confirmed policy.
- Text follows the site's readable body/quote typography; accent/background/border follow existing `--pb-*` tokens in both light and dark mode.
- Keep quote text/marks, `authorName` and `authorTitle`. Selecting a style is undoable; a site-theme switch is not a per-post content edit.

## 4. Decorative themes and typography

| Block | Remove as author-controlled presentation | Keep |
|---|---|---|
| Code | Per-block `theme`, persisted `zoom`, sidebar zoom slider and node-view zoom writers | Monospace/syntax highlighting, language, file name, line numbers/highlights, wrap, copy, collapse and total-line behaviour |
| Block maths | Per-block `theme`, `fontFamily`, `fontSize`; arbitrary padding above | LaTeX source, valid KaTeX fonts, rendered preview/error handling, alignment |
| Tabs | `tabStyle` selection and decorative variants | Orientation, titles, count/order, active/default tab, keyboard/accessibility behaviour |
| Accordion | `paneStyle`, `triggerIcon` selection and decorative variants | Titles/content, count/order, columns, single-open/start-collapsed/default-open behaviour; one standard accessible trigger icon |
| Separator | Arbitrary colour/thickness and vertical margin | Separator block; existing Solid / Dashed / Dotted named line styles |
| Dialogue | Arbitrary outer margins | Compact/Accent/Avatar layouts, speaker identity colours, avatars, text/kind/title and all content operations |

- Site theme determines colours and typography through shared tokens. Code syntax token colours may use one automatic light/dark highlighting palette selected by the site mode; do not collapse every syntax token to body text or remove semantic highlight lines.
- Formula typography must stay KaTeX-compatible; do not apply an ordinary body font that breaks glyph metrics. Mathematical scale is a shared default, not per-block state.
- A reader-only existing zoom control, if retained, must be ephemeral and not write a post attr or recreate author presentation choices. Do not add a new reader preference product as part of this work.
- Preserve theme upload/validation and theme selection elsewhere. No new site-wide settings dashboard is required to replace each removed block selector.
- Update extension parsing/rendering, all document creation paths, node-view chrome, public/diff rendering, localised labels and registry capabilities together. Only delete code-theme CSS/constants after confirming remaining readers/source-edit panels no longer need them.

## 5. Not in this change

Inline emphasis/highlighting, annotation/ruby, links, semantic headings, file previews, video embeds and custom HTML remain. Do not rewrite user-authored HTML/CSS to enforce presets. General block alignment and existing non-image block-width presets remain. Retiring these would require new scope, not be inferred from the phrase “site owns presentation”.
