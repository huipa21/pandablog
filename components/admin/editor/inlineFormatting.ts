export interface InlineActiveState {
  bold: boolean
  italic: boolean
  strike: boolean
  code: boolean
  highlight: boolean
  link: boolean
  subscript: boolean
  superscript: boolean
}

export function inlineMenuLabel(label: string, active: boolean) {
  return active ? `✓ ${label}` : label
}

export function hasAnyDropdownInlineActive(state: InlineActiveState) {
  return state.code || state.highlight || state.subscript || state.superscript
}
