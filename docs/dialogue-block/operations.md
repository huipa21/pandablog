# Dialogue block: operations

## Enable / disable

- Set `dialogueBlock` under `modules.editor.blocks` in `pandablog.modules.json` (default `true`). Use `npm run configure` or edit the manifest; a rebuild is required for the build-time define `__PB_BLOCK_DIALOGUE_BLOCK__`.
- Disabled: insertion, keyboard shortcuts, conversion and settings are unavailable. Existing content shows the disabled-block placeholder on public pages and in the editor.
- The disabled editor retains the dialogue schema, but no commands, input rules or repair plugin, so existing dialogue content is not erased when opening/saving a post. Stored JSON is not migrated on toggling the flag; re-enabling restores rendering.

## Authoring

- Insert via `/dialogue`, `/roleplay`, `/script`, the block inserter, or Ctrl/Cmd+Shift+D. New blocks contain two characters and two empty speech lines.
- Inside a line: Enter splits and alternates speakers; Ctrl/Cmd+Enter splits with the same speaker; Shift+Enter inserts a hard break; Ctrl/Cmd+Shift+D adds a speech line below.
- Enter on an empty last line exits to a paragraph. If it is the only line, the empty block is replaced by a paragraph to preserve the `dialogueLine+` schema. Backspace deletes an empty line but never the only line.
- Type `Name: ` or `Name：` at line start to assign/create a character. Names match case-insensitively. Ctrl/Cmd+Z immediately after conversion restores the typed prefix.
- Multiline plain-text paste **inside** a dialogue line parses speech, thought (`Name (thought): text`) and narration. Blank script lines are skipped. Single-line paste is unchanged; pasting outside dialogue does not auto-convert.
- To convert existing paragraphs, select contiguous paragraphs and choose **Transform to… → Convert paragraphs to dialogue** in the expanded block toolbar. Prefixes become metadata; remaining marks and inline nodes are retained. The operation is undoable.
- Click a speaker to search/select/create a character. Up/Down navigate, Enter selects and Esc returns focus to the line. The line menu offers kind, duplication, reorder and deletion actions.
- The block menu selects Compact / Accent / Avatar, duplicates or deletes the scene. Settings additionally edit character names, palette colours, media-library avatars and spacing. Deleting a character requires confirmation and turns its lines into narration.
- Character limit: 24 per block; name limit: 40 characters; title limit: 120 characters. At the character limit, unmatched script prefixes remain narration and the picker stops offering creation.
- Title/name/spacing inputs commit on change, allowing spaces to be typed before normalization. Changes update every affected line.

## Data and compatibility

- Data lives inside post content JSON and per-block `block` rows via `BlockId`. No schema migration, new tables or API routes.
- `dialogueBlock` owns characters; `dialogueLine` owns only `kind`, `characterId` and inline content. Characters are not shared between blocks/posts.
- The repair plugin normalizes attributes and converts missing/orphan speakers to narration after document changes. Public and editor rendering also normalize before displaying attrs.
- Diff extraction treats each dialogue line as its own text row; speaker names are metadata, not line text.
- Backup/restore uses the existing post/block backup. Avatars use library paths, which the existing recursive reference tracker recognizes for reservations, backups and privacy.
- Rollback: an older image without these node types can drop unknown nodes when an editor re-saves the post. Do not edit dialogue posts on a rolled-back build. Export a backup before rollback.

## Security and privacy

- Colours must be six-digit hex values; injected CSS is replaced with a palette value before reaching `style`.
- Avatar attrs accept only media-library paths/URLs. Rendering canonicalizes them through `toPublicMediaUrl`, not the supplied host; settings store `/media/<hash>` plus the library record ID.
- The existing media endpoint enforces media privacy. Private avatars are not made anonymously accessible by this block.
- Names/titles render as text nodes, never `v-html`. Spacing accepts only `0` or bounded numeric `px`/`rem`/`em` values.

## Theming and responsive behaviour

Override tokens in theme CSS only:

- `--pb-dialogue-speaker-col` (default `7.5rem`)
- `--pb-dialogue-gap`, `--pb-dialogue-line-gap`
- `--pb-dialogue-muted`, `--pb-dialogue-accent-width`, `--pb-dialogue-avatar-size`

Structural rules live exclusively in `assets/css/dialogue-block.css`, imported by both surfaces. Speaker text mixes the character colour with the theme text token for light/dark legibility; the colour remains an accent and is never the only identifier. Names remain visible and have full-name tooltips. At <=40rem the speaker stacks above the text; narration has no indent. Long words wrap rather than creating viewport scroll.

The style-drift baseline intentionally permits only the persisted character palette and colour-validation test fixtures; the new UI/CSS uses theme tokens.

## Troubleshooting

| Symptom | Check |
|---|---|
| Block missing from slash menu | Flag is false, editor module is disabled, or app was not rebuilt |
| A line unexpectedly becomes narration | Its speaker was deleted/missing, or its ID was invalid |
| Can't create another character | The block already has 24 characters |
| Avatar doesn't load | Library URL/hash, media visibility, media endpoint response and configured media base URL |
| Editor and public differ | Shared CSS imports and the parity specs; don't add theme-only structural styles |
| Horizontal scroll | `.dialogue-text` must retain `overflow-wrap: anywhere`, and custom speaker/gap tokens must fit the viewport |
| E2E server cannot start | Connect to the existing server with `PLAYWRIGHT_BASE_URL`; do not kill another developer's server |
| E2E login returns 403 | API clients must send `x-pandablog-client: non-browser` or valid origin metadata (the dialogue and parity tests do this) |
| E2E login returns 401 | Supply valid E2E admin credentials for the database/server under test |

## Verification

```powershell
npm run lint
npm run typecheck
npx vitest run tests/unit/dialogueBlock.test.ts
npx stylelint assets/css/dialogue-block.css
$env:PLAYWRIGHT_BASE_URL = 'http://[::1]:3000' # only if using this existing local server
# Supply E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD for that server.
npx playwright test tests/e2e/all-blocks-parity.spec.ts tests/e2e/editor-public-visual-parity.spec.ts tests/e2e/dialogue-block.spec.ts --workers=1 --max-failures=1
```

As of 2026-10-07: lint, typecheck, CSS lint and 30 unit tests pass. An isolated Chromium smoke check passed actual Tiptap keyboard/input-rule/paste/conversion flows. Full authenticated tests are **pending**, blocked by `401 Invalid username or password` with the environment's E2E credentials. See `acceptance-test.md` for outstanding manual checks, especially real media/privacy, flag-off save/reload, theme contrast, backup/restore and version-history UI.
