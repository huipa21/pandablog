# Dialogue block: data model and extension

All code lives in `extensions/dialogueBlock.ts`.

## dialogueBlock

- `group: 'block'`, `content: 'dialogueLine+'`, `defining`, `isolating`.
- HTML: `div[data-type="dialogue-block"].dialogue-block`.

| Attr | Type | Default | Notes |
|---|---|---|---|
| `title` | string | `''` | Trimmed, max 120 chars; hidden when empty |
| `dialogueStyle` | `'compact' \| 'accent' \| 'avatar'` | `'compact'` | Unknown values become `compact` |
| `characters` | `DialogueCharacter[]` | 2 seed characters | Max 24. `id` short slug, `name` max 40, `color` palette or `#rrggbb`, `avatarMediaId` / `avatarSrc` null or media-library values |
| `marginTop` / `marginBottom` | string | `'1rem'` | Same as accordion |
| `blockId` | via `BlockId` global attr | | Added to `BLOCK_ID_NODE_TYPES` |

## dialogueLine

- `content: 'inline*'` (all existing marks plus footnote / ruby / inline math nodes).
- HTML: `div[data-type="dialogue-line"].dialogue-line` with `data-kind` and `data-character-id`.
- Attrs: `kind` = `'speech' | 'narration' | 'thought'` (default `speech`); `characterId` string or null.
- Narration stores `characterId: null`.

## Repair plugin (appendTransaction)

- Clamp `dialogueStyle`, title length, character count/fields and colours.
- A line with an unknown `characterId` becomes narration with `characterId: null`.
- A speech/thought line with a null `characterId` becomes narration.

## Shared helpers (exported)

- `DIALOGUE_PALETTE`: 8 colours readable in light and dark themes.
- `normalizeDialogueAttrs`, `normalizeCharacter`, `isSafeDialogueColor`, `isSafeAvatarSrc`.
- `resolveCharacter(characters, id)`, `initialsOf(name)` (1–2 letters; CJK names use the first character).
- `nextAlternatingSpeaker(lines, index, characters)`: the speaker of the nearest earlier speech/thought line whose speaker differs from the current line; otherwise the first other character; otherwise the same speaker.
- `parseDialogueScript(text, characters)` returns `{ lines, characters }`:
  - `Name: text` → speech
  - `Name (thought): text` → thought
  - any other non-empty line → narration
  - blank lines are skipped; the full-width colon `：` is accepted.

## Commands

`insertDialogueBlock`, `addDialogueLine(kind)`, `setDialogueLineKind(kind)`, `setDialogueLineCharacter(id)`, `duplicateDialogueLine`, `moveDialogueLine(direction)`, `deleteDialogueLine`, `convertParagraphsToDialogue`, `upsertDialogueCharacter(character)`, `removeDialogueCharacter(id)`.

## Keyboard (only inside a dialogueLine)

| Key | Behaviour |
|---|---|
| Enter | Split the line; the new line is speech by `nextAlternatingSpeaker` |
| Mod+Enter | Split the line; same speaker |
| Shift+Enter | Hard break inside the line |
| Enter on an empty last line | Delete the line, insert a paragraph after the block and focus it; if it is the only line, replace the empty block with a paragraph |
| Backspace at the start of an empty line | Delete the line (never the last one); caret moves to the end of the previous line |
| Mod+Shift+D | Inside: add a speech line below. Outside: insert a dialogue block |

## Input rule

At the start of a line, `Name: ` or `Name：` (1–40 chars, no colon) matches a character case-insensitively or creates one with the next palette colour. It sets `kind: speech` and the `characterId`, then deletes the prefix. Undo restores the typed text. Immediately after the rule, Mod+Z uses `undoInputRule` (including the delimiter) before falling through to normal history.

## Paste rule

`handlePaste` inside a dialogueLine: plain text containing a newline is parsed with `parseDialogueScript`, replaces the selection with lines and adds new characters. Single-line paste is untouched.

## Text extraction / diff

`dialogueBlock` is in the container list in `utils/contentDiffText.ts`, so each `dialogueLine` diffs as its own inline row (`dialogueLine: text`). `dialogueLine` itself is not a container. Speaker names are not part of the line text.
