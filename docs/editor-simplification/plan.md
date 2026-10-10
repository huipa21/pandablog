# Editor simplification: implementation plan

**Status: implementation delegated, ES-D08 confirmed; local implementation and verification underway.** The user requested this plan and subsequently delegated implementation. Current evidence and remaining work are in progress; the delegation does not authorize deployment or user-data operations. Read [progress.md](./progress.md) first; record execution status/evidence there, not by changing task definitions here.

## 1. Target

Authors choose content and a small number of semantic presets. Shared block components translate those presets into the site's tokens and defaults. Removing controls means removing their active document state, handlers and rendering branches too, not hiding them under Advanced.

| Today | Target |
|---|---|
| Image pixels, percentages, height, aspect lock, free resizing | Small / Medium / Full content width; always preserve aspect ratio |
| Image source resolution dropdown | Automatic resolution selection |
| Columns with draggable custom proportions | Equal / Wider left / Wider right presets |
| Arbitrary margins, padding and column gaps | Consistent spacing set by the site |
| Per-quote fonts, sizes, text/background colours | Default quote design; a small number of named styles |
| Per-block decorative themes | Site colours and typography |
| Local inserter-open ref mirrored to Pinia by two watchers | One store-backed ref; keep Pinia |

Keep content/functional controls: URLs/media selection, alt text, captions, attribution, headings, links, inline emphasis, code language/file name/highlighted lines/wrapping, labels, child order/count, accordion open behaviour, dialogue characters and avatars. All existing block types remain available.

## 2. Scope and decisions

- Preserve the [WYSIWYG block contract](../../.github/copilot-instructions.md): matching visible block markup, shared tokens/styles and responsive behaviour. Themes own token values/defaults, **not independent block implementations or public-only CSS overrides**.
- Apply image simplification to standalone images and images within media/text. Use preset splits for media/text as well so its draggable divider cannot recreate arbitrary column proportions.
- For two columns offer all three layouts; for three through six columns offer Equal only. Preserve current child-count limits and content operations; do not remove extra columns to fit a preset.
- Retain the existing quote styles Bar and Quotation marks, with Bar as default. Their fonts/colours/spacing come from the site. No new quote-style catalogue.
- Remove decorative code-theme, maths-font/scale, tab-style, accordion-pane-style/icon and separator-colour/thickness overrides. Code remains monospaced with syntax highlighting; maths keeps KaTeX-compatible fonts. Remove persisted code zoom as a typography override; preserve normal browser zoom and existing reader functionality.
- Keep dialogue's Compact/Accent/Avatar structural layouts and character identification colours/avatars; those are not new per-block theme systems. Remove dialogue's arbitrary margins. Do not redesign dialogue authoring.
- Existing content/wide/full-bleed choices for **non-image blocks** and general alignment are outside this change. Full content width for images means the containing content column, not viewport-wide/full-bleed.
- Proposed baseline image widths are one-third / two-thirds / full containing width; two-column splits are 1:1 / 2:1 / 1:2. These are implementation defaults within the approved direction, not measured UX results. See specs for token/responsive rules.
- **Confirmed product decision ES-D08:** existing custom visual attrs normalize to presets/site defaults, with canonical attrs persisted on the next ordinary save and no bulk post/history rewrite. The user confirmed this after implementation delegation. [Spec 03](./specs/03-state-and-existing-content.md) defines the mapping and persistence boundary. Do not release a half-migrated editor.

**Non-goals:** replacing Pinia/Tiptap/Nuxt; a page-builder or generic preset framework; new feature flags/settings/environment variables; splitting components solely to reach a line-count target; changes to footnotes/annotations/block insertion semantics except the inserter state bug; media storage/variant generation/auth APIs; a bulk post/version migration; deployment or live-data operations.

## 3. Documents and precedence

| Document | Purpose |
|---|---|
| [Spec 00](./specs/00-architecture.md) | Invariants, source inventory and complexity boundaries |
| [Spec 01](./specs/01-images.md) | Image presets, aspect preservation and automatic sources |
| [Spec 02](./specs/02-layout-and-presentation.md) | Column/media splits, spacing, quotes and decorative themes |
| [Spec 03](./specs/03-state-and-existing-content.md) | Pinia source of truth, insertion-target lifecycle and proposed existing-content policy |
| [Acceptance](./acceptance-test.md) | Test/evidence matrix and quality gates |
| [Operations](./operations.md) | Target author/upgrade behaviour; not current executable behaviour |
| [Handoff](./handoff.md) | Copyable full-task implementation delegation |
| [Progress](./progress.md) | Sole implementation status, evidence and decision ledger |

This package supersedes only conflicting author-configurable presentation requirements once implemented. In particular, dialogue arbitrary spacing in its older [UX spec](../dialogue-block/specs/02-editor-ux.md) is targeted for removal. Historical implementation results remain historical. No unrelated security, media, restore, feature availability or parity requirement is waived.

## 4. Tasks

### ES-00 — Approved documentation and handoff

- **Depends on:** none. **Size:** S; docs only.
- **Deliverables:** this package; narrow predecessor/discovery links; explicit scope, unimplemented status and existing-content decision gate.
- **Done when:** local links, task/dependency references and whitespace checks pass; no application code or user data changed.

### ES-01 — Current inventory and characterization

- **Depends on:** ES-00. **Specs:** all. **Acceptance:** A1–A3, B1–B4, C1–C7, D1–D4.
- Inventory every writer/reader of retired attrs: registry, extensions, settings, node views, public rendering, paste/HTML import, media picking/upload, document versions/restore and diff surfaces. Line numbers in specs are hints.
- Capture failing target regressions for sizing-mode inconsistency, removed resize paths, external inserter close/reopen and legacy-content handling. Establish parity baselines on owned fixtures.
- Record ES-D08 confirmation before changing existing-content semantics. Verify new tests/helpers are tracked; the repository ignores most new test/script paths by default.
- **Done when:** source map and test-to-contract disposition are recorded; no content/functional controls are incorrectly classified as decorative; decision gate is resolved or clearly blocked.

### ES-02 — One inserter state source

- **Depends on:** ES-01's state inventory; may proceed while ES-D08 is unresolved. **Specs:** 03 section 1. **Acceptance:** A1–A3.
- Use `storeToRefs(editorStore)` for `inserterOpen`; delete the local boolean ref and both mirror watchers. Keep Pinia and current store actions.
- Explicitly clear pending insertion targets on every close route; no stale target after parent/store close and reopen. Keep target positions local to the editor.
- **Done when:** child + button, parent/mobile/swipe entry, close/cancel, pick, initial store state and navigation lifecycle tests pass; no two-way mirroring remains.

### ES-03 — Image presets and automatic sources

- **Depends on:** ES-01 and ES-D08 confirmation. **Specs:** 01, 03. **Acceptance:** B1–B4, D1–D4.
- Update image/media-text schemas, registry and all creation paths, settings, node views and public renderers together. Remove dimension/lock/source selectors, free image resizing and overlapping sizing attrs/branches under the confirmed existing-content policy.
- Share bounded source selection and sizing rules, preserve source geometry and content attrs, use existing media URLs/authorization and metadata safely.
- **Done when:** only the three size presets are authored; image source selection is automatic without crop/animation loss or broken missing-variant fallback; save/reload/HTML paths and editor/public parity pass.

### ES-04 — Preset layouts and site-owned presentation

- **Depends on:** ES-03. **Specs:** 02, 03. **Acceptance:** C1–C7, D1–D4.
- Remove manual column/media proportions and their drag handlers. Keep child count/order/header operations and canonical layout presets.
- Remove per-block arbitrary spacing, quote typography/colour controls and decorative theme overrides throughout settings, inline block chrome, schemas, registry and renderers. Update en/zh-CN strings and capability declarations together.
- Reuse existing site tokens and shared block styles. Do not create a second public-only appearance system or disable content/reader functionality to simplify styling.
- **Done when:** retired controls cannot recreate attrs through another route; site colours/spacing/fonts drive both surfaces; two-column and multi-column responsiveness, code alignment and dialogue behaviour pass.

### ES-05 — Integration, verification and final handoff

- **Depends on:** ES-02, ES-04. **Specs:** all. **Acceptance:** all rows.
- Run combined quality and owned production/browser checks. Exercise create/paste/import/save/reload, versions/restore/diffs and theme changes on both surfaces.
- Reconcile active docs, supported serialized attrs and translations; remove dead helpers/imports/styles without deleting shared media/theme/highlighting dependencies still used elsewhere.
- **Done when:** required local evidence passes; missing runtimes/checks are explicitly blocked; operations and progress state compatibility/remaining gates truthfully. No deployment is authorized.

## 5. Execution and definition of done

After a separate implementation delegation, execute ES-01–05 continuously in dependency order; do not ask for approval at routine task boundaries. Pause only for unresolved ES-D08, a genuine new scope/security/data decision, or unavailable mandatory verification after independent work is exhausted.

For each code task: targeted regressions, lint including style-drift, production-mode typecheck without the real `.env`, unit suite and `git diff --check`; touched CSS must pass targeted stylelint. At final integration run the [acceptance matrix](./acceptance-test.md), owned production build and actual browser parity at 360/768/1024/1440 pixels, light/dark and en/zh-CN.

Use the pinned supported Node version; record installed versions, OS, commands/counts/skips and evidence tiers. Follow [fixture safety](../backend-hardening/harness.md) and [owned runtime/browser rules](../backend-hardening/release-handoff.md). Never use the user's `.env`, configured server/DB, storage, accounts or containers. Preserve unrelated dirty changes; no commit/push/deploy. Missing browser/runtime evidence is not a pass, and old parity fixtures with mostly defaults do not prove the new preset matrix.
