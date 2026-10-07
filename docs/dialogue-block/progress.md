# Dialogue block: progress

> Read this first in every session. The plan is in [`plan.md`](./plan.md), the specs are in [`specs/`](./specs/), acceptance checks are in [`acceptance-test.md`](./acceptance-test.md).
> Update this file at the end of every task: the status table, a session log entry, and decisions.

## Current state

- **Next:** authenticated/manual verification from `acceptance-test.md`. All implementation tasks are complete; this is **not** a claim that the full UI acceptance suite passed.
- **Feature:** registered in the editor/public renderer, with shared CSS, three styles, character picker/settings, commands, keyboard, prefix input rule, paste and paragraph conversion.
- **Active branch:** `main`.
- **Blocker:** the environment's E2E admin credentials return **401 Invalid username or password** against the existing dev server at `http://[::1]:3000`. Do not change accounts or reset the developer database to work around this.
- **Checks:** lint including style-drift, typecheck, CSS stylelint, and 30/30 dialogue units pass. Isolated Chromium extension smoke checks pass. Authenticated Nuxt UI/parity and manual checks remain pending.

## Task status

`done` below means implementation is complete with quality gates and pending acceptance checks documented, as allowed by the plan's Definition of done.

| ID | Title | Status | Date | Notes |
|---|---|---|---|---|
| DLG-1.1 | Feature flag + registration plumbing | done | 2026-10-07 | Keys/types/manifests/label/blockId/diff container; define generated from `EDITOR_BLOCK_KEYS`; example now included in Git |
| DLG-1.2 | Schema + helpers | done | 2026-10-07 | Nodes, normalization/repair/parser/speaker helpers; expanded suite 30/30 |
| DLG-2.1 | Shared CSS + public component | done | 2026-10-07 | `dialogue-block.css`, lazy public renderer, normalized attrs, disabled placeholder |
| DLG-2.2 | Editor NodeViews | done | 2026-10-07 | Rendered NodeViews, registry/flag map, toolbar, bilingual strings; disabled schema preserved |
| DLG-3.1 | Keyboard + commands | done | 2026-10-07 | All commands and keys; PM transaction units and actual Chromium keymap/history smoke pass |
| DLG-3.2 | Input rule + paste + convert | done | 2026-10-07 | Prefix undo, scoped paste, explicit toolbar conversion preserving inline content; unit/browser smoke pass |
| DLG-3.3 | Character picker + menus | done | 2026-10-07 | Search/create/keyboard/focus handling, block and line menus; authenticated UI pending |
| DLG-3.4 | BlockSettings panel | done | 2026-10-07 | Style preview cards, palette/name/avatar/confirmed delete/spacing; settings UI pending |
| DLG-4.1 | E2E parity + responsive | done | 2026-10-07 | Dialogue fixture in both parity suites; 14 dialogue e2e cases incl. three styles/four viewports; auth execution blocked |
| DLG-4.2 | Operations + final review | done | 2026-10-07 | Operations finalized; acceptance reviewed and evidence/pending checks recorded; full runtime sign-off awaits valid credentials/manual review |

Status values: `todo` · `in-progress` · `blocked` · `done` · `skipped`

## Decisions / deviations

- Characters are per block, not post/site. Line content is `inline*` with all existing marks and inline atoms.
- Avatars are coloured initials with optional media-library images. Compact is the default; no chat bubbles.
- Enter alternates speakers (A/B/A); Mod+Enter keeps the speaker. A single `dialogueLine` with `kind` represents speech, thought and narration.
- Header is an optional title only. Fixed speaker column is `7.5rem`, with ellipsis and full-name tooltips; stacking breakpoint is <=40rem as explicitly required by spec 03.
- Only `dialogueBlock` is a diff container; `dialogueLine` is its own inline diff row. Speaker names are metadata, not line text.
- Unit file is `tests/unit/dialogueBlock.test.ts` (`*.test.ts` matches Vitest). Helpers/authoring transactions are exported and tested with plain `EditorState`; no jsdom/happy-dom dependency was added.
- Spacing is restricted to `0` or numeric `px`/`rem`/`em` values because it reaches inline styles. Script bodies beginning with `//` remain narration so URL-like lines aren't parsed as speakers.
- Explicit empty character lists remain valid and turn all lines into narration; the schema/insertion defaults seed two characters.
- Enter on the **only** empty line replaces the entire empty block with a paragraph; otherwise deleting the line would violate `dialogueLine+`. Backspace still never deletes the only line.
- Prefix undo binds Mod+Z to Tiptap `undoInputRule` when applicable, then falls through to normal history. This restores the typed delimiter rather than undoing the entire typing group.
- `DialogueSettings.vue` is extracted from the already-large `BlockSettings.vue`; the requested section mounts it with the selected block attrs/position. Names/title/spacing commit on change so trimming doesn't prevent typing spaces.
- The disabled editor retains the dialogue schema without authoring/repair hooks and renders a placeholder. This intentionally differs from simply dropping the extension: opening a disabled dialogue post must not erase its JSON.
- Both avatar surfaces canonicalize accepted paths via `toPublicMediaUrl`. Settings store a local library path; media privacy/reference tracking reuse existing infrastructure.
- Speaker text blends 60% character colour / 40% theme text to improve light/dark legibility; colour dots/accent borders keep the persisted palette. Theme-specific contrast still needs manual review.
- Style-drift baseline additions are limited to the intentional persisted palette and colour-validation fixtures. New CSS/components use tokens.
- `.gitignore` previously excluded the unit test, parity tests and example manifest. Explicit exceptions now include all deliverables; no unrelated ignored files were added.
- Both existing parity tests now send the application's required `x-pandablog-client: non-browser` header for API fixture operations; no server auth/origin policy was weakened.

## Session log

### 2026-10-07: DLG-1.1, DLG-1.2 (original foundation)

- Created docs (specs 00–03, plan, progress, operations, acceptance-test).
- Feature plumbing: `build/pandablog-modules.ts`, `types/pandablog-modules.ts`, `types/module-flags.d.ts`, `scripts/configure-modules.ts`, both manifests, `extensions/blockId.ts`, `utils/contentDiffText.ts`.
- Added `extensions/dialogueBlock.ts`: nodes, normalizers, safety validators, alternating speaker, script parser, character creation/initials, exported repair helper/plugin. Added 13 unit tests.
- Checks: 13/13 units, touched-file ESLint, typecheck pass. Full lint wasn't run in that session.

### 2026-10-07: DLG-2.1 through DLG-4.2

- Preserved the pre-existing staged foundation/docs/config changes and implemented the remaining tasks in dependency order.
- Rendering: shared `assets/css/dialogue-block.css`, public `NodeDialogueBlock.vue`, editor `DialogueBlockNodeView.vue` / `DialogueLineNodeView.vue`, disabled NodeView, content renderer and editor registration.
- Authoring: all listed commands and shortcuts, real input rule with undo support, multiline clipboard plugin, selected-paragraph conversion, `DialogueCharacterPicker.vue`, block/line menus.
- Settings: `blocks/DialogueSettings.vue` mounted in `BlockSettings.vue`, shared palette, existing `MediaPicker`, confirmed character deletion, spacing and selectable style previews.
- Registry/toolbar and en/zh-CN localization completed. Added intentional baseline/Git exceptions.
- Tests: 30 units including transaction positioning, marks, undo, line operations, character removal, parser/safety, JSON/save/blockId round trip and per-line diff extraction. Added 14 authenticated dialogue cases plus dialogue fixtures/entries in both parity suites.
- **Executed:** `npm run lint`, `npm run typecheck`, `npx stylelint assets/css/dialogue-block.css`, targeted Vitest and `git diff --check` pass. Isolated Chromium smoke passed real Enter/Mod+Enter/Shift+Enter/Mod+Shift+D/Backspace/exit, prefix conversion + one-key undo, clipboard paste + undo, convert/can/marks/undo.
- **Attempted:** full parity/dialogue Playwright invocation. Default IPv4 URL could not reuse the existing IPv6 Nuxt server and hit its dev lock. Reused `http://[::1]:3000`, corrected test API-client origin headers, then stopped at the first **401 invalid-credentials** failure. No post/media fixtures were created in the blocked authenticated run, and the developer's server was not killed.
- Finalized operations and reviewed every acceptance row. Pending checks are listed below and in the acceptance document.

## Pending authenticated/manual checks

- All Nuxt authoring/picker/menu/settings assertions and actual editor/public visual parity.
- Responsive rendering at 360/768/1024/1440 with real app chrome; three styles; inline footnote/ruby/link parity.
- Flag-off rebuild: insertion unavailable, placeholders shown, existing JSON survives editor save/reload; flag-on restoration.
- Media picker selection, avatar image/clear, private-media response and light/dark contrast >=4.5:1.
- Database save/reload, non-destructive backup round trip in a disposable environment, and version-history UI after enabling postVersioning.
