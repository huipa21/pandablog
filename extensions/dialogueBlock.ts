import { InputRule, Node, mergeAttributes } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
import { EditorState, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Fragment } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export type DialogueStyle = 'compact' | 'accent' | 'avatar'
export type DialogueLineKind = 'speech' | 'narration' | 'thought'

export interface DialogueCharacter {
  id: string
  name: string
  color: string
  avatarMediaId: string | null
  avatarSrc: string | null
}

export interface DialogueLineAttrs {
  kind: DialogueLineKind
  characterId: string | null
}

export interface DialogueBlockAttrs {
  title: string
  dialogueStyle: DialogueStyle
  characters: DialogueCharacter[]
  marginTop: string
  marginBottom: string
}

export interface ParsedDialogueLine extends DialogueLineAttrs {
  text: string
}

export const DIALOGUE_PALETTE = [
  '#7c3aed',
  '#2563eb',
  '#059669',
  '#d97706',
  '#dc2626',
  '#db2777',
  '#0d9488',
  '#475569'
] as const

export const DIALOGUE_MAX_CHARACTERS = 24
export const DIALOGUE_MAX_NAME_LENGTH = 40
export const DIALOGUE_MAX_TITLE_LENGTH = 120

const DIALOGUE_STYLES = new Set<DialogueStyle>(['compact', 'accent', 'avatar'])
const LINE_KINDS = new Set<DialogueLineKind>(['speech', 'narration', 'thought'])
const SAFE_COLOR = /^#[0-9a-f]{6}$/i
const SAFE_ID = /^[a-z0-9_-]{1,32}$/i
const SAFE_MEDIA_ID = /^[\w:.-]{1,128}$/
const SAFE_SPACING = /^(?:0|-?\d{1,4}(?:\.\d{1,3})?(?:px|rem|em))$/
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const SCRIPT_LINE = /^([^:：\n]{1,40}?)\s*(?:[(（]\s*(thought|thinking|心想|内心)\s*[)）])?\s*[:：]\s*(.*)$/iu

export function isSafeDialogueColor(value: unknown): value is string {
  return typeof value === 'string' && SAFE_COLOR.test(value)
}

// Avatars must point at the media library; anything else (data:, javascript:, foreign hosts' arbitrary paths) is dropped.
export function isSafeAvatarSrc(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const src = value.trim()
  if (!src || src.length > 2048) return false
  if (/^\/(?:api\/media\/file|media)\/[^/?#\s]+(?:\?[^#\s]*)?$/.test(src)) return true
  try {
    const url = new URL(src)
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && !url.username && !url.password
      && /\/(?:api\/media\/file|media)\/[^/?#\s]+$/.test(url.pathname)
  } catch {
    return false
  }
}

export function generateDialogueCharacterId() {
  return `c${Math.random().toString(36).slice(2, 8)}`
}

export function pickDialogueColor(characters: Pick<DialogueCharacter, 'color'>[]) {
  const used = new Set(characters.map((character) => character.color.toLowerCase()))
  return DIALOGUE_PALETTE.find((color) => !used.has(color)) ?? DIALOGUE_PALETTE[characters.length % DIALOGUE_PALETTE.length]!
}

export function normalizeCharacter(raw: unknown, index: number, usedIds: Set<string> = new Set()): DialogueCharacter {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  let id = typeof record.id === 'string' && SAFE_ID.test(record.id) ? record.id : ''
  while (!id || usedIds.has(id)) id = generateDialogueCharacterId()
  usedIds.add(id)

  const name = typeof record.name === 'string' ? record.name.trim().slice(0, DIALOGUE_MAX_NAME_LENGTH) : ''
  const color = isSafeDialogueColor(record.color) ? record.color.toLowerCase() : DIALOGUE_PALETTE[index % DIALOGUE_PALETTE.length]!
  const avatarMediaId = typeof record.avatarMediaId === 'string' && SAFE_MEDIA_ID.test(record.avatarMediaId) ? record.avatarMediaId : null
  const avatarSrc = isSafeAvatarSrc(record.avatarSrc) ? record.avatarSrc.trim() : null

  return { id, name: name || `Character ${index + 1}`, color, avatarMediaId, avatarSrc }
}

export function normalizeCharacters(value: unknown): DialogueCharacter[] {
  const list = Array.isArray(value) ? value.slice(0, DIALOGUE_MAX_CHARACTERS) : []
  const usedIds = new Set<string>()
  return list.map((raw, index) => normalizeCharacter(raw, index, usedIds))
}

export function normalizeDialogueStyle(value: unknown): DialogueStyle {
  return DIALOGUE_STYLES.has(value as DialogueStyle) ? value as DialogueStyle : 'compact'
}

export function normalizeDialogueTitle(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, DIALOGUE_MAX_TITLE_LENGTH) : ''
}

function normalizeSpacing(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return SAFE_SPACING.test(text) ? text : '1rem'
}

export function normalizeDialogueAttrs(attrs: Record<string, unknown> | null | undefined): DialogueBlockAttrs {
  return {
    title: normalizeDialogueTitle(attrs?.title),
    dialogueStyle: normalizeDialogueStyle(attrs?.dialogueStyle),
    characters: normalizeCharacters(attrs?.characters),
    marginTop: normalizeSpacing(attrs?.marginTop),
    marginBottom: normalizeSpacing(attrs?.marginBottom)
  }
}

export function normalizeDialogueLineAttrs(attrs: Record<string, unknown> | null | undefined, characterIds: Set<string>): DialogueLineAttrs {
  const kind = LINE_KINDS.has(attrs?.kind as DialogueLineKind) ? attrs!.kind as DialogueLineKind : 'speech'
  if (kind === 'narration') return { kind, characterId: null }
  const characterId = typeof attrs?.characterId === 'string' ? attrs.characterId : null
  if (!characterId || !characterIds.has(characterId)) return { kind: 'narration', characterId: null }
  return { kind, characterId }
}

export function resolveCharacter(characters: DialogueCharacter[], id: string | null | undefined) {
  if (!id) return null
  return characters.find((character) => character.id === id) ?? null
}

export function initialsOf(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const first = Array.from(trimmed)[0]!
  if (CJK_CHAR.test(first)) return first
  const words = trimmed.split(/\s+/).filter(Boolean)
  return words.slice(0, 2).map((word) => Array.from(word)[0]!.toUpperCase()).join('')
}

export function findCharacterByName(characters: DialogueCharacter[], name: string) {
  const needle = name.trim().toLocaleLowerCase()
  return characters.find((character) => character.name.toLocaleLowerCase() === needle) ?? null
}

/** Returns the existing or newly appended character, or null when the cast is full. */
export function findOrCreateCharacter(characters: DialogueCharacter[], name: string): DialogueCharacter | null {
  const existing = findCharacterByName(characters, name)
  if (existing) return existing
  if (characters.length >= DIALOGUE_MAX_CHARACTERS) return null
  const usedIds = new Set(characters.map((character) => character.id))
  const created = normalizeCharacter({ name, color: pickDialogueColor(characters) }, characters.length, usedIds)
  characters.push(created)
  return created
}

function speakerOf(line: DialogueLineAttrs | undefined) {
  return line && line.kind !== 'narration' ? line.characterId : null
}

/** Speaker for a new line inserted after `index`, alternating A/B/A. */
export function nextAlternatingSpeaker(lines: DialogueLineAttrs[], index: number, characters: DialogueCharacter[]): string | null {
  let current: string | null = null
  for (let cursor = index; cursor >= 0 && !current; cursor -= 1) current = speakerOf(lines[cursor])

  if (current) {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const speaker = speakerOf(lines[cursor])
      if (speaker && speaker !== current && characters.some((character) => character.id === speaker)) return speaker
    }
  }

  const other = characters.find((character) => character.id !== current)
  return other?.id ?? current ?? null
}

/** Parses a plain-text script; mutates nothing and returns the extended cast. */
export function parseDialogueScript(text: string, characters: DialogueCharacter[]) {
  const cast = characters.map((character) => ({ ...character }))
  const lines: ParsedDialogueLine[] = []

  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const match = line.match(SCRIPT_LINE)
    const body = match?.[3] ?? ''
    // `see https://…` must stay narration, not speaker "see https".
    if (match && !body.startsWith('//')) {
      const character = findOrCreateCharacter(cast, match[1]!)
      if (character) {
        lines.push({ kind: match[2] ? 'thought' : 'speech', characterId: character.id, text: body })
        continue
      }
    }

    lines.push({ kind: 'narration', characterId: null, text: line })
  }

  return { lines, characters: cast }
}

export function createDefaultDialogueCharacters(): DialogueCharacter[] {
  const usedIds = new Set<string>()
  return [
    normalizeCharacter({ name: 'Character A', color: DIALOGUE_PALETTE[0] }, 0, usedIds),
    normalizeCharacter({ name: 'Character B', color: DIALOGUE_PALETTE[1] }, 1, usedIds)
  ]
}

function parseCharactersAttr(element: HTMLElement) {
  try {
    return normalizeCharacters(JSON.parse(element.getAttribute('data-characters') ?? '[]'))
  } catch {
    return []
  }
}

export function createDialogueContent(names = ['Character A', 'Character B']): JSONContent {
  const characters = createDefaultDialogueCharacters().map((character, index) => ({ ...character, name: names[index] ?? character.name }))
  return {
    type: 'dialogueBlock',
    attrs: { ...normalizeDialogueAttrs({ characters }), characters },
    content: characters.map((character) => ({ type: 'dialogueLine', attrs: { kind: 'speech', characterId: character.id } }))
  }
}

/** Works on the current transaction so commands compose correctly in chains. */
export function dialogueContext(tr: Transaction) {
  const { $from, $to } = tr.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name !== 'dialogueBlock') continue
    const block = $from.node(depth)
    const blockPos = $from.before(depth)
    const index = $from.index(depth)
    const line = $from.node(depth + 1)
    if ($to.pos > $from.end(depth) || !line || line.type.name !== 'dialogueLine') return null
    return { block, blockPos, depth, index, line, linePos: $from.before(depth + 1), characters: normalizeCharacters(block.attrs.characters) }
  }
  // Block menu and settings use a node selection.
  const node = tr.doc.nodeAt(tr.selection.from)
  if (node?.type.name === 'dialogueBlock' && node.firstChild) {
    return { block: node, blockPos: tr.selection.from, depth: $from.depth + 1, index: 0, line: node.firstChild, linePos: tr.selection.from + 1, characters: normalizeCharacters(node.attrs.characters) }
  }
  return null
}

function selectDialogueLine(tr: Transaction, pos: number, offset = 0) {
  tr.setSelection(TextSelection.create(tr.doc, pos + 1 + offset))
  return true
}

function lineAttrsFor(ctx: NonNullable<ReturnType<typeof dialogueContext>>, kind: DialogueLineKind, sameSpeaker = false) {
  const lines: DialogueLineAttrs[] = []
  ctx.block.forEach((line) => lines.push(line.attrs as DialogueLineAttrs))
  const characterId = kind === 'narration' ? null : sameSpeaker
    ? ctx.line.attrs.characterId ?? ctx.characters[0]?.id ?? null
    : nextAlternatingSpeaker(lines, ctx.index, ctx.characters)
  return normalizeDialogueLineAttrs({ kind, characterId }, new Set(ctx.characters.map((character) => character.id)))
}

export function addDialogueLineTransaction(tr: Transaction, kind: DialogueLineKind = 'speech') {
  const ctx = dialogueContext(tr)
  if (!ctx) return false
  const pos = ctx.linePos + ctx.line.nodeSize
  tr.insert(pos, ctx.line.type.create(lineAttrsFor(ctx, kind)))
  return selectDialogueLine(tr, pos)
}

export function splitDialogueLineTransaction(tr: Transaction, sameSpeaker = false) {
  let ctx = dialogueContext(tr)
  if (!ctx || tr.selection.$to.parent !== ctx.line) return false
  if (!sameSpeaker && tr.selection.empty && !ctx.line.content.size && ctx.index === ctx.block.childCount - 1) {
    const paragraph = tr.doc.type.schema.nodes.paragraph?.create()
    if (!paragraph) return false
    const after = ctx.blockPos + ctx.block.nodeSize
    const parent = tr.doc.resolve(ctx.blockPos).parent
    if (!parent.canReplaceWith(tr.doc.resolve(after).index(), tr.doc.resolve(after).index(), paragraph.type)) return false
    if (ctx.block.childCount === 1) {
      tr.replaceWith(ctx.blockPos, after, paragraph)
      return selectDialogueLine(tr, ctx.blockPos)
    }
    tr.delete(ctx.linePos, ctx.linePos + ctx.line.nodeSize)
    const pos = tr.mapping.map(after)
    tr.insert(pos, paragraph)
    return selectDialogueLine(tr, pos)
  }
  tr.deleteSelection()
  ctx = dialogueContext(tr)
  if (!ctx) return false
  const offset = tr.selection.$from.parentOffset
  const first = ctx.line.type.create(ctx.line.attrs, ctx.line.content.cut(0, offset), ctx.line.marks)
  const second = ctx.line.type.create(lineAttrsFor(ctx, 'speech', sameSpeaker), ctx.line.content.cut(offset), ctx.line.marks)
  tr.replaceWith(ctx.linePos, ctx.linePos + ctx.line.nodeSize, Fragment.fromArray([first, second]))
  return selectDialogueLine(tr, ctx.linePos + first.nodeSize)
}

export function setDialogueLineTransaction(tr: Transaction, attrs: Partial<DialogueLineAttrs>) {
  const ctx = dialogueContext(tr)
  if (!ctx) return false
  const next = { ...ctx.line.attrs, ...attrs }
  if (next.kind !== 'narration' && !next.characterId) next.characterId = ctx.characters[0]?.id ?? null
  const normalized = normalizeDialogueLineAttrs(next, new Set(ctx.characters.map((character) => character.id)))
  tr.setNodeMarkup(ctx.linePos, undefined, { ...ctx.line.attrs, ...normalized })
  return true
}

export function deleteDialogueLineTransaction(tr: Transaction, backspace = false) {
  const ctx = dialogueContext(tr)
  if (!ctx || ctx.block.childCount <= 1) return false
  if (backspace && (!tr.selection.empty || ctx.line.content.size || tr.selection.$from.parentOffset)) return false
  const previous = ctx.index > 0 ? ctx.block.child(ctx.index - 1) : null
  tr.delete(ctx.linePos, ctx.linePos + ctx.line.nodeSize)
  return selectDialogueLine(tr, previous ? ctx.linePos - previous.nodeSize : ctx.linePos, previous?.content.size ?? 0)
}

export function duplicateDialogueLineTransaction(tr: Transaction) {
  const ctx = dialogueContext(tr)
  if (!ctx) return false
  const pos = ctx.linePos + ctx.line.nodeSize
  tr.insert(pos, ctx.line)
  return selectDialogueLine(tr, pos)
}

export function moveDialogueLineTransaction(tr: Transaction, direction: 'up' | 'down') {
  const ctx = dialogueContext(tr)
  if (!ctx) return false
  const target = ctx.index + (direction === 'up' ? -1 : 1)
  if (target < 0 || target >= ctx.block.childCount) return false
  const other = ctx.block.child(target)
  const from = direction === 'up' ? ctx.linePos - other.nodeSize : ctx.linePos
  const to = direction === 'up' ? ctx.linePos + ctx.line.nodeSize : ctx.linePos + ctx.line.nodeSize + other.nodeSize
  tr.replaceWith(from, to, Fragment.fromArray(direction === 'up' ? [ctx.line, other] : [other, ctx.line]))
  return selectDialogueLine(tr, direction === 'up' ? from : from + other.nodeSize)
}

export function upsertDialogueCharacterTransaction(tr: Transaction, character: Partial<DialogueCharacter> & { name: string }) {
  const ctx = dialogueContext(tr)
  if (!ctx) return false
  const characters = ctx.characters.map((item) => ({ ...item }))
  const index = characters.findIndex((item) => item.id === character.id)
  if (index < 0 && characters.length >= DIALOGUE_MAX_CHARACTERS) return false
  const usedIds = new Set(characters.filter((_, i) => i !== index).map((item) => item.id))
  const normalized = normalizeCharacter(index < 0 ? { color: pickDialogueColor(characters), ...character } : { ...characters[index], ...character }, index < 0 ? characters.length : index, usedIds)
  if (index < 0) characters.push(normalized)
  else characters[index] = normalized
  tr.setNodeMarkup(ctx.blockPos, undefined, { ...ctx.block.attrs, characters })
  return true
}

export function removeDialogueCharacterTransaction(tr: Transaction, id: string) {
  const ctx = dialogueContext(tr)
  if (!ctx || !ctx.characters.some((character) => character.id === id)) return false
  tr.setNodeMarkup(ctx.blockPos, undefined, { ...ctx.block.attrs, characters: ctx.characters.filter((character) => character.id !== id) })
  ctx.block.forEach((line, offset) => {
    if (line.attrs.characterId === id) tr.setNodeMarkup(ctx.blockPos + 1 + offset, undefined, { ...line.attrs, kind: 'narration', characterId: null })
  })
  return true
}

export function applyDialoguePrefix(tr: Transaction, from: number, to: number, name: string) {
  const ctx = dialogueContext(tr)
  if (!ctx || from !== ctx.linePos + 1 || tr.selection.$to.parent !== ctx.line) return false
  const characters = ctx.characters.map((character) => ({ ...character }))
  const character = findOrCreateCharacter(characters, name)
  if (!character) return false
  tr.setNodeMarkup(ctx.blockPos, undefined, { ...ctx.block.attrs, characters })
  tr.setNodeMarkup(ctx.linePos, undefined, { ...ctx.line.attrs, kind: 'speech', characterId: character.id })
  tr.delete(from, to)
  return true
}

/** Multiline plain-text paste only. Preserve inline marks on the untouched prefix/suffix. */
export function pasteDialogueScriptTransaction(tr: Transaction, text: string) {
  const ctx = dialogueContext(tr)
  if (!ctx || !/[\r\n]/.test(text) || tr.selection.$from.parent.type.name !== 'dialogueLine' || tr.selection.$to.parent.type.name !== 'dialogueLine') return false
  const parsed = parseDialogueScript(text, ctx.characters)
  if (!parsed.lines.length) return false
  const { $from, $to } = tr.selection
  const prefix = $from.parent.content.cut(0, $from.parentOffset)
  const suffix = $to.parent.content.cut($to.parentOffset)
  const nodes = parsed.lines.map(({ text: body, ...attrs }, index) => {
    let content = body ? Fragment.from(tr.doc.type.schema.text(body)) : Fragment.empty
    if (index === 0) content = prefix.append(content)
    if (index === parsed.lines.length - 1) content = content.append(suffix)
    return ctx.line.type.create(attrs, content)
  })
  tr.setNodeMarkup(ctx.blockPos, undefined, { ...ctx.block.attrs, characters: parsed.characters })
  tr.replaceWith($from.before(), $to.after(), Fragment.fromArray(nodes))
  const lastPos = $from.before() + nodes.slice(0, -1).reduce((size, node) => size + node.nodeSize, 0)
  return selectDialogueLine(tr, lastPos, nodes[nodes.length - 1]!.content.size - suffix.size)
}

/** Convert the contiguous selected paragraphs, keeping marks and inline nodes. */
export function convertParagraphsToDialogueTransaction(tr: Transaction) {
  const { $from, $to } = tr.selection
  if (!$from.sameParent($to) && ($from.depth !== $to.depth || $from.node(-1) !== $to.node(-1))) return false
  if ($from.parent.type.name !== 'paragraph' || $to.parent.type.name !== 'paragraph') return false
  const parent = $from.node(-1)
  const startIndex = $from.index(-1)
  const endIndex = $to.index(-1)
  if (!parent.canReplaceWith(startIndex, endIndex + 1, tr.doc.type.schema.nodes.dialogueBlock!)) return false
  let characters: DialogueCharacter[] = []
  const lines: ProseMirrorNode[] = []
  for (let index = startIndex; index <= endIndex; index += 1) {
    const paragraph = parent.child(index)
    if (paragraph.type.name !== 'paragraph') return false
    const parsed = parseDialogueScript(paragraph.textContent, characters)
    characters = parsed.characters
    const parsedLine = parsed.lines[0]
    const attrs = parsedLine ?? { kind: 'narration', characterId: null }
    // A prefix is metadata; the remaining inline content (marks/ruby/footnotes) stays intact.
    const match = paragraph.textContent.trimStart().match(SCRIPT_LINE)
    const prefixSize = parsedLine && parsedLine.kind !== 'narration' && match
      ? paragraph.textContent.length - paragraph.textContent.trimStart().length + match[0].length - match[3]!.length : 0
    lines.push(tr.doc.type.schema.nodes.dialogueLine!.create({ kind: attrs.kind, characterId: attrs.characterId }, paragraph.content.cut(prefixSize)))
  }
  const pos = $from.before()
  const block = tr.doc.type.schema.nodes.dialogueBlock!.create(normalizeDialogueAttrs({ characters }), lines)
  tr.replaceWith(pos, $to.after(), block)
  return selectDialogueLine(tr, pos + 1)
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    dialogue: {
      insertDialogueBlock: (names?: string[]) => ReturnType
      addDialogueLine: (kind?: DialogueLineKind) => ReturnType
      setDialogueLineKind: (kind: DialogueLineKind) => ReturnType
      setDialogueLineCharacter: (id: string) => ReturnType
      duplicateDialogueLine: () => ReturnType
      moveDialogueLine: (direction: 'up' | 'down') => ReturnType
      deleteDialogueLine: () => ReturnType
      convertParagraphsToDialogue: () => ReturnType
      upsertDialogueCharacter: (character: Partial<DialogueCharacter> & { name: string }) => ReturnType
      removeDialogueCharacter: (id: string) => ReturnType
    }
  }
}

export const DialogueBlockNode = Node.create<{ characterNames: string[] }>({
  name: 'dialogueBlock',
  group: 'block',
  content: 'dialogueLine+',
  defining: true,
  isolating: true,

  addOptions() {
    return { characterNames: ['Character A', 'Character B'] }
  },

  addAttributes() {
    return {
      title: {
        default: '',
        parseHTML: (el) => normalizeDialogueTitle(el.getAttribute('data-title')),
        renderHTML: (attrs) => (attrs.title ? { 'data-title': normalizeDialogueTitle(attrs.title) } : {})
      },
      dialogueStyle: {
        default: 'compact',
        parseHTML: (el) => normalizeDialogueStyle(el.getAttribute('data-style')),
        renderHTML: (attrs) => ({ 'data-style': normalizeDialogueStyle(attrs.dialogueStyle) })
      },
      characters: {
        default: createDefaultDialogueCharacters(),
        parseHTML: (el) => parseCharactersAttr(el),
        renderHTML: (attrs) => ({ 'data-characters': JSON.stringify(normalizeCharacters(attrs.characters)) })
      },
      marginTop: {
        default: '1rem',
        parseHTML: (el) => normalizeSpacing(el.getAttribute('data-margin-top')),
        renderHTML: (attrs) => ({ 'data-margin-top': normalizeSpacing(attrs.marginTop) })
      },
      marginBottom: {
        default: '1rem',
        parseHTML: (el) => normalizeSpacing(el.getAttribute('data-margin-bottom')),
        renderHTML: (attrs) => ({ 'data-margin-bottom': normalizeSpacing(attrs.marginBottom) })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="dialogue-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'dialogue-block', class: 'dialogue-block' }), 0]
  },

  addCommands() {
    return {
      insertDialogueBlock: (names) => ({ commands }) => commands.insertContent(createDialogueContent(names ?? this.options.characterNames)),
      addDialogueLine: (kind = 'speech') => ({ tr, dispatch }) => dispatch ? addDialogueLineTransaction(tr, kind) : !!dialogueContext(tr),
      setDialogueLineKind: (kind) => ({ tr, dispatch }) => dispatch ? setDialogueLineTransaction(tr, { kind }) : !!dialogueContext(tr),
      setDialogueLineCharacter: (id) => ({ tr, dispatch }) => {
        const ctx = dialogueContext(tr)
        if (!ctx || !resolveCharacter(ctx.characters, id)) return false
        return dispatch ? setDialogueLineTransaction(tr, { characterId: id, kind: ctx.line.attrs.kind === 'narration' ? 'speech' : ctx.line.attrs.kind }) : true
      },
      duplicateDialogueLine: () => ({ tr, dispatch }) => dispatch ? duplicateDialogueLineTransaction(tr) : !!dialogueContext(tr),
      moveDialogueLine: (direction) => ({ tr, dispatch }) => {
        const ctx = dialogueContext(tr)
        if (!ctx || (direction === 'up' ? ctx.index === 0 : ctx.index === ctx.block.childCount - 1)) return false
        return dispatch ? moveDialogueLineTransaction(tr, direction) : true
      },
      deleteDialogueLine: () => ({ tr, dispatch }) => dispatch ? deleteDialogueLineTransaction(tr) : (dialogueContext(tr)?.block.childCount ?? 0) > 1,
      convertParagraphsToDialogue: () => ({ tr, dispatch, state }) => convertParagraphsToDialogueTransaction(dispatch ? tr : EditorState.create({ schema: state.schema, doc: tr.doc, selection: tr.selection }).tr),
      upsertDialogueCharacter: (character) => ({ tr, dispatch }) => dispatch ? upsertDialogueCharacterTransaction(tr, character) : !!dialogueContext(tr),
      removeDialogueCharacter: (id) => ({ tr, dispatch }) => dispatch ? removeDialogueCharacterTransaction(tr, id) : !!dialogueContext(tr)?.characters.some((character) => character.id === id)
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-d': () => dialogueContext(this.editor.state.tr) ? this.editor.commands.addDialogueLine() : this.editor.commands.insertDialogueBlock()
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('dialogueScriptPaste'),
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData('text/plain') ?? ''
            const tr = view.state.tr
            if (!pasteDialogueScriptTransaction(tr, text)) return false
            view.dispatch(tr.scrollIntoView())
            return true
          }
        }
      }),
      new Plugin({
        key: new PluginKey('dialogueBlockRepair'),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null
          return repairDialogueBlocks(newState)
        }
      })
    ]
  }
})

export function repairDialogueBlocks(state: EditorState): Transaction | null {
  const tr = state.tr
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'dialogueBlock') return true
    repairDialogueBlock(node, pos, tr)
    return false
  })
  return tr.docChanged ? tr : null
}

// Attr-only updates keep node sizes, so positions computed from the original doc stay valid.
function repairDialogueBlock(node: ProseMirrorNode, pos: number, tr: Transaction) {
  const attrs = normalizeDialogueAttrs(node.attrs)
  if (!sameJson(attrs, pickBlockAttrs(node.attrs))) {
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs })
  }

  const ids = new Set(attrs.characters.map((character) => character.id))
  node.forEach((child, offset) => {
    if (child.type.name !== 'dialogueLine') return
    const lineAttrs = normalizeDialogueLineAttrs(child.attrs, ids)
    if (lineAttrs.kind !== child.attrs.kind || lineAttrs.characterId !== child.attrs.characterId) {
      tr.setNodeMarkup(pos + 1 + offset, undefined, { ...child.attrs, ...lineAttrs })
    }
  })
}

function pickBlockAttrs(attrs: Record<string, unknown>) {
  return {
    title: attrs.title,
    dialogueStyle: attrs.dialogueStyle,
    characters: attrs.characters,
    marginTop: attrs.marginTop,
    marginBottom: attrs.marginBottom
  }
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export const DialogueLineNode = Node.create({
  name: 'dialogueLine',
  content: 'inline*',
  defining: true,
  selectable: false,

  addAttributes() {
    return {
      kind: {
        default: 'speech',
        parseHTML: (el) => el.getAttribute('data-kind') ?? 'speech',
        renderHTML: (attrs) => ({ 'data-kind': String(attrs.kind ?? 'speech') })
      },
      characterId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-character-id'),
        renderHTML: (attrs) => (attrs.characterId ? { 'data-character-id': String(attrs.characterId) } : {})
      }
    }
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.command(({ tr }) => splitDialogueLineTransaction(tr)),
      'Mod-Enter': () => this.editor.commands.command(({ tr }) => splitDialogueLineTransaction(tr, true)),
      'Shift-Enter': () => this.editor.isActive('dialogueLine') ? this.editor.commands.setHardBreak() : false,
      'Mod-z': () => this.editor.isActive('dialogueLine') ? this.editor.commands.undoInputRule() : false,
      Backspace: () => this.editor.commands.command(({ tr }) => {
        const ctx = dialogueContext(tr)
        if (!ctx || !tr.selection.empty || ctx.line.content.size || tr.selection.$from.parentOffset) return false
        // Consume the key for the only remaining line: never let the base keymap lift it.
        return ctx.block.childCount === 1 || deleteDialogueLineTransaction(tr, true)
      })
    }
  },

  addInputRules() {
    return [new InputRule({
      find: /^([^:：\n]{1,40})(?:: |：\s?)$/u,
      handler: ({ state, range, match }) => {
        if (!applyDialoguePrefix(state.tr, range.from, range.to, match[1]!)) return null
      }
    })]
  },

  parseHTML() {
    return [{ tag: 'div[data-type="dialogue-line"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'dialogue-line', class: 'dialogue-line' }), 0]
  }
})
