# Dialogue block: editor UX

Reference: the mockup (editor, block toolbar, character selector, context menu).

## Rendered by default

The editor shows exactly the public layout. Editor-only chrome is positioned outside the `.dialogue-block` layout flow and appears only on hover, focus or selection.

## DialogueBlockNodeView.vue

- Root `.dialogue-block[data-style]`; each line sets inline `--pb-dialogue-color`.
- Title: `.dialogue-block-title`, an input styled identically to the public title, placeholder "Scene title (optional)". Hidden when empty and the block is not selected.
- Chrome on hover/focus: a "Dialogue" chip, a ⋮ block menu (style, duplicate, delete) and a footer "Add line: + Dialogue · + Narration · + Thought" (ghost/secondary buttons).

## DialogueLineNodeView.vue

- `.dialogue-line[data-kind]` > `.dialogue-speaker` (a button in the editor, a div on the public page, same box) + `NodeViewContent.dialogue-text`.
- The speaker button opens `DialogueCharacterPicker`.
- Line ⋮ on hover: Change character, Add line below, Convert to narration / thought / dialogue, Duplicate line, Move up, Move down, Delete.

## DialogueCharacterPicker.vue

- Popover: search input; list with colour dot or avatar, name and a check on the current speaker; "+ New character" (created from the search text); footer hint "Ctrl/Cmd+Shift+D add dialogue line".
- Keyboard: Up/Down, Enter selects, Esc closes and returns focus to the line.

## BlockSettings panel (dialogueBlock)

- Dialogue style: three selectable cards with a mini preview; the selected card has a stronger border and a tint.
- Characters: rows with colour swatch (palette popover), name input, avatar pick/clear (existing media picker) and delete (confirm: "Lines become narration").
- Spacing: the existing spacing controls (`supports.spacing`).

## Registry / toolbar

- `useBlockRegistry` entry: name `dialogueBlock`, title "Dialogue", icon `i-lucide-message-square-quote`, category `text`, keywords dialogue / roleplay / script / scene / conversation / chat. `createContent`: two characters (Character A, Character B; palette 0 and 1) and two empty speech lines.
- `BlockToolbar` icon mapping; the slash menu comes from the registry.
