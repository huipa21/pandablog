# Dialogue block: editor UX

Reference: the mockup (editor, block toolbar, character selector, context menu).

## Rendered by default

The dialogue lines share the public layout. Line actions are positioned outside the content flow and appear only on hover, focus or selection. An editor-only trailing blank row reserves space for the add-line plus, avoiding layout shifts when the button appears.

## DialogueBlockNodeView.vue

- Root `.dialogue-block[data-style]`; each line sets inline `--pb-dialogue-color`.
- Title: `.dialogue-block-title`, an input styled identically to the public title, placeholder "Scene title (optional)". Hidden when empty and the block is not selected.
- Single plus in the trailing blank row on hover/focus/selection, aligned directly beneath the preceding character name in Compact, Accent and Avatar styles. Clicking opens Dialogue / Narration choices and returns focus to the new line.
- No extra block menu: styles live in settings; duplicate/delete use the general hovering toolbar. Existing thought lines remain supported, but Thought is not offered as a menu choice.

## DialogueLineNodeView.vue

- `.dialogue-line[data-kind]` > `.dialogue-speaker` (a button in the editor, a div on the public page, same box) + `NodeViewContent.dialogue-text`.
- The speaker button opens `DialogueCharacterPicker`.
- Line ⋮ on hover/focus/selection: Switch to narration / Switch to dialogue, Duplicate line, Move up, Move down, Delete dialogue. Switching keeps text/marks intact and narration → dialogue uses the first available character; disabled if the scene has no characters. Each explicit action is independently undoable and returns focus to the editor after the popup fully closes.
- No per-line plus buttons; Enter/Ctrl+Enter create the next alternating speaker's line, while Shift+Enter inserts a tighter hard break within the same dialogue.

## DialogueCharacterPicker.vue

- Popover: search input; list with colour dot or avatar, name and a check on the current speaker; "+ New character" (created from the search text); footer hint "Ctrl/Cmd+Shift+D add dialogue line".
- Keyboard: Up/Down, Enter selects, Esc closes and returns focus to the line.

## BlockSettings panel (dialogueBlock)

- Dialogue style: three selectable cards with a mini preview; the selected card has a stronger border and a tint.
- Characters: rows with clickable initials/avatar, name input and delete (confirm: "Lines become narration"). Clicking initials/avatar opens the palette and a custom-avatar option using the existing image-filtered media-library picker, plus Clear avatar when an image is set.
- Add character creates a new character with an unused palette colour where possible and a unique default name, then focuses/selects the name input. Disabled at the existing 24-character limit; added characters are immediately available in the speaker picker.
- Spacing: arbitrary dialogue margins and spacing controls are removed by the [editor presentation follow-up](../../editor-simplification/specs/02-layout-and-presentation.md); site spacing now applies. Structural styles, character colours/avatars and authoring remain. Exact local evidence and incomplete full-app acceptance are in the new [ledger](../../editor-simplification/progress.md).

## Registry / toolbar

- `useBlockRegistry` entry: name `dialogueBlock`, title "Dialogue", icon `i-lucide-message-square-quote`, category `text`, keywords dialogue / roleplay / script / scene / conversation / chat. `createContent`: two characters (Character A, Character B; palette 0 and 1) and two empty speech lines.
- `BlockToolbar` icon mapping; the slash menu comes from the registry.
