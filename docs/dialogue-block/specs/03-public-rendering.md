# Dialogue block: public rendering and styles

## Markup (both surfaces)

```text
div.dialogue-block[data-style]
  div.dialogue-block-title            (only when title is set)
  div.dialogue-line[data-kind]        (repeated)
    div.dialogue-speaker
      span.dialogue-avatar            (avatar style only)
      span.dialogue-speaker-name
    div.dialogue-text
```

Narration lines render an empty speaker cell (keeps grid alignment) with `aria-hidden="true"`.

## Accessibility

- The speaker name is real text, so screen readers read "Maya Are you sure…". Thought lines add a visually hidden "(thought)" after the name.
- Colour is never the only signal; the name is always shown.
- Avatar images use `alt=""` because the name is adjacent.

## Tokens (`assets/css/dialogue-block.css`, `:root`)

| Token | Value |
|---|---|
| `--pb-dialogue-speaker-col` | `7.5rem` (fixed) |
| `--pb-dialogue-gap` | `1rem` |
| `--pb-dialogue-line-gap` | `0.75rem` |
| `--pb-dialogue-muted` | theme muted text colour |
| `--pb-dialogue-accent-width` | `2px` |
| `--pb-dialogue-avatar-size` | `2rem` |

## Layout

- `.dialogue-line`: grid, columns `var(--pb-dialogue-speaker-col) minmax(0, 1fr)`, column gap `var(--pb-dialogue-gap)`, aligned on the first text baseline (not the height of a wrapped/multiline dialogue).
- Speaker name: uppercase, inherited dialogue font size/line height, weight 600, letter-spacing 0.04em, colour derived from `var(--pb-dialogue-color)` (60%) and the theme text token (40%) for light/dark legibility. Accent borders retain the character colour. Single line, ellipsis on overflow; the `title` attribute holds the full name.
- **compact**: no accent.
- **accent**: speaker cell has a left border of `--pb-dialogue-accent-width` in the speaker colour, plus 0.5rem left padding.
- **avatar**: speaker cell shows the avatar circle (initials on a tinted background, or the image) with the name; the name is not uppercase. The name alone supplies the speaker baseline; the circle is positioned beside and centred on its line, so changing initials to an image cannot shift the dialogue baseline.
- **narration**: text column only, italic, muted, 0.95em.
- **thought**: speaker shown; text italic and muted.
- Title: small label, weight 600, muted, margin below equal to the line gap.
- At 40rem or narrower: each line becomes a single column, the speaker sits above the text, narration has no indent.
- `.dialogue-text` uses `overflow-wrap: anywhere` so long words never cause horizontal scroll.
- Dark mode via theme tokens only.

## Inline content

`NodeDialogueBlock.vue` renders line children with `ContentRenderer`, so marks, footnotes and ruby work unchanged.
