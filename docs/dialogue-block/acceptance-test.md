# Dialogue block: acceptance tests

Updated **2026-10-07**. `pass` means the cited check was executed successfully; `pending` is not a pass.

Evidence:
- **unit**: `npx vitest run tests/unit/dialogueBlock.test.ts` — 30/30 pass.
- **Chromium smoke**: production extension bundled into an isolated browser, with real key events, clipboard events and history. Passed six-line alternation, same-speaker split, hard break, add/delete/exit, prefix undo, multiline paste/undo and paragraph conversion/marks/undo. This does **not** verify the Nuxt NodeViews or public rendering.
- **authenticated suite**: tests added in `tests/e2e/dialogue-block.spec.ts`, fixture in `tests/e2e/fixtures/dialogue.ts`, `dialogue` added to both parity suites. Run attempted against the existing `http://[::1]:3000` dev server; login returned **401 Invalid username or password**. UI/parity assertions therefore remain pending. Initial default-URL run could not start because the server already held the Nuxt dev lock; it was not stopped or replaced.

## A. Insertion

| ID | Check | Type | Status / evidence (2026-10-07) |
|---|---|---|---|
| A1 | `/dialogue` (and keywords roleplay, script) inserts 2 characters and 2 empty speech lines | e2e | pending authenticated suite; seed schema unit pass |
| A2 | Mod+Shift+D outside inserts a block; inside adds a speech line | e2e | inside Chromium smoke pass; outside Nuxt insertion pending |
| A3 | Flag off: block not offered, disabled placeholder, JSON unchanged | manual | pending flag-off rebuild + save/reload; schema retention implemented |

## B. Authoring

| ID | Check | Type | Status / evidence (2026-10-07) |
|---|---|---|---|
| B1 | Six lines entered with Enter alternate Maya/Alex/Maya/Alex/Maya/Alex | unit + e2e | unit and Chromium smoke pass; Nuxt e2e pending |
| B2 | Mod+Enter keeps the current speaker | e2e | Chromium smoke pass; Nuxt e2e pending |
| B3 | Shift+Enter inserts a hard break in the same line | e2e | Chromium smoke pass; Nuxt e2e pending |
| B4 | Enter on an empty last line exits to a paragraph | e2e | unit and Chromium smoke pass; Nuxt e2e pending |
| B5 | Backspace removes an empty line; never the only line | e2e | unit and Chromium smoke pass; Nuxt e2e pending |
| B6 | `John: ` creates John, removes the prefix; one undo restores it | e2e | prefix unit and real input-rule Chromium smoke pass; Nuxt e2e pending |
| B7 | A five-line script including a blank line produces four correct lines/new characters | unit + e2e | parser/selection units and Chromium paste/undo pass; Nuxt e2e pending |
| B8 | Convert selected paragraphs to dialogue, preserving marks, undoable | e2e | unit and Chromium command/can/marks/undo pass; toolbar e2e pending |
| B9 | Bold / italic / link / footnote / ruby render identically on both surfaces | e2e | pending; all three style fixtures assert inline markup and metrics |

## C. Characters and menus

| ID | Check | Type | Status / evidence (2026-10-07) |
|---|---|---|---|
| C1 | Picker filters; Up/Down/Enter selects; Esc closes and refocuses | e2e | pending character-picker test |
| C2 | New character from search is created and assigned | e2e | pending character-picker test; creation/helper unit pass |
| C3 | Settings rename updates every affected line | e2e | pending settings test; shared character update unit pass |
| C4 | Confirmed deletion turns the character's lines into narration | unit + e2e | removal transaction + repair units pass; confirm-dialog e2e pending |
| C5 | Line menu change character/add/kind/duplicate/move/delete, undoable | e2e | transactions unit pass; menu e2e pending |
| C6 | Initials, library avatar on both surfaces, clear back to initials | manual + e2e | initials unit pass; image-upload/render/clear e2e added, pending; actual media picker/privacy manual pending |

## D. Styles and parity

| ID | Check | Type | Status / evidence (2026-10-07) |
|---|---|---|---|
| D1 | Compact / Accent / Avatar match editor and public | e2e | pending three style tests + all-blocks-parity |
| D2 | Public title is hidden when empty; editor placeholder only while active | e2e | pending title test |
| D3 | Fixed 7.5rem speaker column, long-name ellipsis/full-name tooltip | e2e | pending responsive style tests |
| D4 | Narration: italic/muted in text column; thought: italic/muted with speaker | visual | pending visual review; structural/CSS assertions included in style tests |
| D5 | Light/dark legibility and >=4.5:1 speaker-name contrast | manual | pending theme review; theme-text colour mixing implemented |

## E. Responsive

| ID | Check | Type | Status / evidence (2026-10-07) |
|---|---|---|---|
| E1 | 360px: no viewport scroll; speakers stack; editor matches | e2e | pending responsive style tests |
| E2 | 768/1024/1440px: two columns, no overflow, editor matches | e2e | pending responsive style tests |
| E3 | Long unbroken words wrap in dialogue text | e2e | pending long-word fixture and `overflow-wrap` metric checks |

## F. Safety and robustness

| ID | Check | Type | Status / evidence (2026-10-07) |
|---|---|---|---|
| F1 | Injected colour is replaced by a palette colour | unit | pass: unsafe colour normalization + repair tests |
| F2 | Orphan characterId becomes narration | unit | pass: line normalization + repair + removal tests |
| F3 | Avatar src outside the media library is dropped | unit | pass: media-library avatar validation test |
| F4 | Save/reload and backup/restore round trip | manual | save normalization/JSON/blockId unit round trip pass; actual database save/reload + backup/restore pending |
| F5 | Version-history diff shows line-text changes | manual | `docToDiffText` unit pass; version-history UI pending (module is disabled in the local manifest) |

## G. Quality gates

| ID | Check | Status / evidence (2026-10-07) |
|---|---|---|
| G1 | npm run lint, including style-drift | pass; palette + validation fixtures deliberately added to baseline; new CSS separately passes stylelint |
| G2 | npm run typecheck | pass |
| G3 | Dialogue unit suite | pass — 30/30 |
| G4 | all-blocks-parity, editor-public-visual-parity and dialogue-block e2e | pending — auth blocked (401); origin opt-in headers now supplied by both parity suites |

## Pending manual run

Use a valid admin account on the server/database under test. Re-run the authenticated suites before claiming WYSIWYG verification. Check flag-off preservation, media selection and private-media behaviour, light/dark contrast, save/reload, backup/restore, and version-history UI. Do not perform a destructive backup restore against the developer's current database just to satisfy this checklist.
