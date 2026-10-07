import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { closeHistory, history, undo } from '@tiptap/pm/history'
import Bold from '@tiptap/extension-bold'
import HardBreak from '@tiptap/extension-hard-break'
import { BlockId } from '../../extensions/blockId'
import { docToDiffText } from '../../utils/contentDiffText'
import { normalizeDocForSave } from '../../utils/emptyBlocks'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import {
  addDialogueLineTransaction,
  applyDialoguePrefix,
  convertParagraphsToDialogueTransaction,
  createDialogueContent,
  deleteDialogueLineTransaction,
  duplicateDialogueLineTransaction,
  moveDialogueLineTransaction,
  pasteDialogueScriptTransaction,
  removeDialogueCharacterTransaction,
  setDialogueLineTransaction,
  splitDialogueLineTransaction,
  upsertDialogueCharacterTransaction,
  DIALOGUE_MAX_CHARACTERS,
  DIALOGUE_PALETTE,
  DialogueBlockNode,
  DialogueLineNode,
  createDefaultDialogueCharacters,
  initialsOf,
  isSafeAvatarSrc,
  isSafeDialogueColor,
  nextAlternatingSpeaker,
  normalizeDialogueAttrs,
  normalizeDialogueLineAttrs,
  parseDialogueScript,
  repairDialogueBlocks,
  type DialogueCharacter,
  type DialogueLineAttrs
} from '../../extensions/dialogueBlock'

const maya: DialogueCharacter = { id: 'maya', name: 'Maya', color: '#7c3aed', avatarMediaId: null, avatarSrc: null }
const alex: DialogueCharacter = { id: 'alex', name: 'Alex', color: '#2563eb', avatarMediaId: null, avatarSrc: null }
const john: DialogueCharacter = { id: 'john', name: 'John', color: '#059669', avatarMediaId: null, avatarSrc: null }

const speech = (characterId: string): DialogueLineAttrs => ({ kind: 'speech', characterId })
const narration: DialogueLineAttrs = { kind: 'narration', characterId: null }

describe('dialogue attribute normalization', () => {
  it('rejects unsafe colours and falls back to the palette', () => {
    expect(isSafeDialogueColor('#AbCdEf')).toBe(true)
    expect(isSafeDialogueColor('red;background:url(x)')).toBe(false)
    expect(isSafeDialogueColor('#fff')).toBe(false)

    const attrs = normalizeDialogueAttrs({ characters: [{ id: 'a', name: 'A', color: 'red;background:url(x)' }] })
    expect(attrs.characters[0]!.color).toBe(DIALOGUE_PALETTE[0])
  })

  it('only accepts media-library avatar sources', () => {
    expect(isSafeAvatarSrc('/media/abc123')).toBe(true)
    expect(isSafeAvatarSrc('/api/media/file/abc123?variant=thumb')).toBe(true)
    expect(isSafeAvatarSrc('https://cdn.example.com/media/abc123')).toBe(true)
    expect(isSafeAvatarSrc('javascript:alert(1)')).toBe(false)
    expect(isSafeAvatarSrc('data:image/png;base64,AAAA')).toBe(false)
    expect(isSafeAvatarSrc('https://evil.example.com/x.png')).toBe(false)
    expect(isSafeAvatarSrc('https://user:pw@cdn.example.com/media/abc')).toBe(false)

    const attrs = normalizeDialogueAttrs({ characters: [{ id: 'a', name: 'A', avatarSrc: 'javascript:alert(1)' }] })
    expect(attrs.characters[0]!.avatarSrc).toBeNull()
  })

  it('clamps style, title, names, count and duplicate ids', () => {
    const attrs = normalizeDialogueAttrs({
      dialogueStyle: 'bubbles',
      title: `  In   the ${'x'.repeat(200)}`,
      marginTop: 'calc(1px + expression(x))',
      characters: [
        { id: 'dup', name: 'n'.repeat(80) },
        { id: 'dup', name: '' },
        ...Array.from({ length: 40 }, (_, index) => ({ name: `C${index}` }))
      ]
    })

    expect(attrs.dialogueStyle).toBe('compact')
    expect(attrs.title.startsWith('In the x')).toBe(true)
    expect(attrs.title).toHaveLength(120)
    expect(attrs.marginTop).toBe('1rem')
    expect(attrs.characters).toHaveLength(DIALOGUE_MAX_CHARACTERS)
    expect(attrs.characters[0]!.name).toHaveLength(40)
    expect(attrs.characters[1]!.name).toBe('Character 2')
    expect(new Set(attrs.characters.map((character) => character.id)).size).toBe(DIALOGUE_MAX_CHARACTERS)
  })

  it('repairs orphan and missing speakers to narration', () => {
    const ids = new Set(['maya'])
    expect(normalizeDialogueLineAttrs({ kind: 'speech', characterId: 'ghost' }, ids)).toEqual(narration)
    expect(normalizeDialogueLineAttrs({ kind: 'thought', characterId: null }, ids)).toEqual(narration)
    expect(normalizeDialogueLineAttrs({ kind: 'narration', characterId: 'maya' }, ids)).toEqual(narration)
    expect(normalizeDialogueLineAttrs({ kind: 'bogus', characterId: 'maya' }, ids)).toEqual(speech('maya'))
    expect(normalizeDialogueLineAttrs({ kind: 'thought', characterId: 'maya' }, ids)).toEqual({ kind: 'thought', characterId: 'maya' })
  })
})

describe('nextAlternatingSpeaker', () => {
  it('alternates A/B/A across six Enter presses', () => {
    const cast = [maya, alex]
    const lines: DialogueLineAttrs[] = [speech('maya')]
    for (let step = 0; step < 5; step += 1) {
      lines.push(speech(nextAlternatingSpeaker(lines, lines.length - 1, cast)!))
    }
    expect(lines.map((line) => line.characterId)).toEqual(['maya', 'alex', 'maya', 'alex', 'maya', 'alex'])
  })

  it('returns to the previous different speaker in a three-person scene', () => {
    const lines = [speech('maya'), speech('john'), speech('alex')]
    expect(nextAlternatingSpeaker(lines, 2, [maya, alex, john])).toBe('john')
  })

  it('skips narration when finding the current and previous speaker', () => {
    const lines = [speech('maya'), speech('alex'), narration]
    expect(nextAlternatingSpeaker(lines, 2, [maya, alex])).toBe('maya')
  })

  it('falls back to another character, then the same one', () => {
    expect(nextAlternatingSpeaker([speech('maya')], 0, [maya, alex])).toBe('alex')
    expect(nextAlternatingSpeaker([speech('maya')], 0, [maya])).toBe('maya')
    expect(nextAlternatingSpeaker([narration], 0, [])).toBeNull()
  })
})

describe('parseDialogueScript', () => {
  it('parses speech, full-width colon, thought, narration and blank lines', () => {
    const script = [
      'Maya: Are you sure this is the right place?',
      '',
      'alex：No. But we\'re already here.',
      'The two of them looked toward the dark hallway.',
      'Maya (thought): Something isn\'t right...'
    ].join('\r\n')

    const { lines, characters } = parseDialogueScript(script, [maya])

    expect(lines).toEqual([
      { kind: 'speech', characterId: 'maya', text: 'Are you sure this is the right place?' },
      { kind: 'speech', characterId: characters[1]!.id, text: 'No. But we\'re already here.' },
      { kind: 'narration', characterId: null, text: 'The two of them looked toward the dark hallway.' },
      { kind: 'thought', characterId: 'maya', text: 'Something isn\'t right...' }
    ])
    expect(characters.map((character) => character.name)).toEqual(['Maya', 'alex'])
    expect(characters[1]!.color).toBe(DIALOGUE_PALETTE[0] === maya.color ? DIALOGUE_PALETTE[1] : DIALOGUE_PALETTE[0])
  })

  it('does not mutate the input cast and keeps URLs as narration', () => {
    const cast = [maya]
    const { lines } = parseDialogueScript('Read https://example.com first\nZoe: hi', cast)
    expect(cast).toHaveLength(1)
    expect(lines[0]).toEqual({ kind: 'narration', characterId: null, text: 'Read https://example.com first' })
    expect(lines[1]!.kind).toBe('speech')
  })
})

describe('initialsOf', () => {
  it('handles latin, CJK and empty names', () => {
    expect(initialsOf('Maya')).toBe('M')
    expect(initialsOf('mary jane watson')).toBe('MJ')
    expect(initialsOf('小明')).toBe('小')
    expect(initialsOf('  ')).toBe('?')
  })
})

const commandSchema = getSchema([Document, Paragraph, Text, Bold, HardBreak, DialogueBlockNode, DialogueLineNode])
function commandState(texts = ['Hello', 'World'], index = 0, offset = 0) {
  const block = commandSchema.nodes.dialogueBlock!.create({ characters: [maya, alex] }, texts.map((text, i) => commandSchema.nodes.dialogueLine!.create(speech(i % 2 ? 'alex' : 'maya'), text ? commandSchema.text(text) : undefined)))
  const doc = commandSchema.nodes.doc!.create(null, [block, commandSchema.nodes.paragraph!.create()])
  let pos = 2
  for (let i = 0; i < index; i += 1) pos += block.child(i).nodeSize
  return EditorState.create({ schema: commandSchema, doc, selection: TextSelection.create(doc, pos + offset), plugins: [history()] })
}
const blockLines = (tr: ReturnType<EditorState['tr']['setSelection']>) => tr.doc.firstChild!.toJSON().content

describe('dialogue authoring transactions', () => {
  it('creates two seed speech lines and optional localized names', () => {
    const content = createDialogueContent(['角色 A', '角色 B'])
    expect(content.content).toHaveLength(2)
    expect(content.attrs!.characters.map((character: DialogueCharacter) => character.name)).toEqual(['角色 A', '角色 B'])
    commandSchema.nodeFromJSON(content).check()
  })

  it('splits at the caret, alternates, and preserves marks', () => {
    const state = commandState(['Hello world'], 0, 6)
    const tr = state.tr.addMark(2, 13, commandSchema.marks.bold!.create())
    expect(splitDialogueLineTransaction(tr)).toBe(true)
    const lines = blockLines(tr)
    expect(lines.map((line: any) => line.content?.[0]?.text)).toEqual(['Hello ', 'world'])
    expect(lines.map((line: any) => line.attrs.characterId)).toEqual(['maya', 'alex'])
    expect(lines[1].content[0].marks[0].type).toBe('bold')
    expect(tr.selection.$from.parent.textContent).toBe('world')
    expect(tr.selection.$from.parentOffset).toBe(0)
    tr.doc.check()
  })

  it('Mod+Enter keeps the speaker, including at an empty last line', () => {
    const tr = commandState([''], 0).tr
    expect(splitDialogueLineTransaction(tr, true)).toBe(true)
    expect(blockLines(tr).map((line: any) => line.attrs.characterId)).toEqual(['maya', 'maya'])
  })

  it('Enter deletes the selected text before splitting', () => {
    const state = commandState(['abcdef'])
    const tr = state.tr.setSelection(TextSelection.create(state.doc, 4, 6))
    expect(splitDialogueLineTransaction(tr)).toBe(true)
    expect(blockLines(tr).map((line: any) => line.content[0].text)).toEqual(['ab', 'ef'])
  })

  it('Enter exits an empty last line to a paragraph', () => {
    const tr = commandState(['Hello', ''], 1).tr
    expect(splitDialogueLineTransaction(tr)).toBe(true)
    expect(blockLines(tr)).toHaveLength(1)
    expect(tr.doc.child(1).type.name).toBe('paragraph')
    expect(tr.selection.$from.parent.type.name).toBe('paragraph')
    tr.doc.check()
  })

  it('Enter exits an only empty line without leaving an invalid empty block', () => {
    const tr = commandState(['']).tr
    expect(splitDialogueLineTransaction(tr)).toBe(true)
    expect(tr.doc.firstChild!.type.name).toBe('paragraph')
    tr.doc.check()
  })

  it('Backspace removes an empty line and focuses the previous end, never the last line', () => {
    const tr = commandState(['Hello', ''], 1).tr
    expect(deleteDialogueLineTransaction(tr, true)).toBe(true)
    expect(tr.selection.$from.parent.textContent).toBe('Hello')
    expect(tr.selection.$from.parentOffset).toBe(5)
    expect(deleteDialogueLineTransaction(tr)).toBe(false)
    expect(deleteDialogueLineTransaction(commandState(['Hello']).tr, true)).toBe(false)
  })

  it('adds narration and thought, changes kind and picks a speaker for narration', () => {
    const tr = commandState().tr
    expect(addDialogueLineTransaction(tr, 'narration')).toBe(true)
    expect(tr.selection.$from.parent.attrs).toEqual(narration)
    expect(setDialogueLineTransaction(tr, { kind: 'thought' })).toBe(true)
    expect(tr.selection.$from.parent.attrs).toEqual({ kind: 'thought', characterId: 'maya' })
    expect(setDialogueLineTransaction(tr, { kind: 'narration' })).toBe(true)
    expect(tr.selection.$from.parent.attrs).toEqual(narration)
  })

  it('duplicates and moves a line in both directions without losing inline content', () => {
    const tr = commandState().tr
    expect(duplicateDialogueLineTransaction(tr)).toBe(true)
    expect(blockLines(tr).map((line: any) => line.content[0].text)).toEqual(['Hello', 'Hello', 'World'])
    expect(moveDialogueLineTransaction(tr, 'down')).toBe(true)
    expect(blockLines(tr).map((line: any) => line.content[0].text)).toEqual(['Hello', 'World', 'Hello'])
    expect(moveDialogueLineTransaction(tr, 'down')).toBe(false)
    expect(moveDialogueLineTransaction(tr, 'up')).toBe(true)
    tr.doc.check()
  })

  it('renames every instance, creates a safe character and removes speakers as narration', () => {
    const tr = commandState(['Hi', 'Hi', 'Hi']).tr
    expect(upsertDialogueCharacterTransaction(tr, { id: 'maya', name: 'Mary' })).toBe(true)
    expect(tr.doc.firstChild!.attrs.characters[0].name).toBe('Mary')
    expect(upsertDialogueCharacterTransaction(tr, { id: 'new', name: 'New', color: 'red;x:y' })).toBe(true)
    expect(tr.doc.firstChild!.attrs.characters[2].color).toMatch(/^#[0-9a-f]{6}$/)
    expect(removeDialogueCharacterTransaction(tr, 'maya')).toBe(true)
    expect(blockLines(tr).map((line: any) => line.attrs.kind)).toEqual(['narration', 'speech', 'narration'])
    expect(removeDialogueCharacterTransaction(tr, 'ghost')).toBe(false)
  })

  it('converts a name prefix only at line start, matching names case-insensitively', () => {
    const tr = commandState(['alex: '], 0, 6).tr
    expect(applyDialoguePrefix(tr, 2, 8, 'alex')).toBe(true)
    expect(tr.doc.firstChild!.attrs.characters).toHaveLength(2)
    expect(tr.selection.$from.parent.attrs.characterId).toBe('alex')
    expect(tr.selection.$from.parent.content.size).toBe(0)
    expect(applyDialoguePrefix(commandState(['x John: '], 0, 8).tr, 4, 10, 'John')).toBe(false)
  })

  it('prefix conversion is undoable and restores the typed prefix', () => {
    let state = commandState(['John: '], 0, 6)
    const tr = closeHistory(state.tr)
    expect(applyDialoguePrefix(tr, 2, 8, 'John')).toBe(true)
    state = state.apply(tr)
    expect(undo(state, (transaction) => { state = state.apply(transaction) })).toBe(true)
    expect(state.doc.firstChild!.firstChild!.textContent).toBe('John: ')
    expect(state.doc.firstChild!.attrs.characters).toHaveLength(2)
  })

  it('pastes scripts into a selection, retaining its unselected prefix and suffix', () => {
    const state = commandState(['Before after'], 0, 7)
    const tr = state.tr
    expect(pasteDialogueScriptTransaction(tr, 'Zoe: hello\n\nMaya (thought): why\nA door opens.\nAlex：bye')).toBe(true)
    const lines = blockLines(tr)
    expect(lines.slice(0, 4).map((line: any) => line.content[0].text)).toEqual(['Before hello', 'why', 'A door opens.', 'byeafter'])
    expect(lines.slice(0, 4).map((line: any) => line.attrs.kind)).toEqual(['speech', 'thought', 'narration', 'speech'])
    expect(tr.doc.firstChild!.attrs.characters).toHaveLength(3)
    expect(tr.selection.$from.parentOffset).toBe(3)
    tr.doc.check()
  })

  it('multiline paste replaces selected lines but not other blocks', () => {
    const state = commandState(['abc', 'def', 'untouched'])
    const tr = state.tr.setSelection(TextSelection.create(state.doc, 3, 9))
    expect(pasteDialogueScriptTransaction(tr, 'Maya: hi\nAlex: bye')).toBe(true)
    expect(blockLines(tr).map((line: any) => line.content[0].text)).toEqual(['ahi', 'byef', 'untouched'])
    expect(pasteDialogueScriptTransaction(commandState().tr, 'single')).toBe(false)
    const across = state.tr.setSelection(TextSelection.create(state.doc, 2, state.doc.content.size - 1))
    expect(pasteDialogueScriptTransaction(across, 'a\nb')).toBe(false)
  })

  it('converts contiguous selected paragraphs, preserving marks and undo', () => {
    const paragraphs = ['Maya: Hello', 'Alex：Hi', 'A door opens.'].map((text) => commandSchema.nodes.paragraph!.create(null, commandSchema.text(text, [commandSchema.marks.bold!.create()])))
    const doc = commandSchema.nodes.doc!.create(null, [...paragraphs, commandSchema.nodes.paragraph!.create()])
    let state = EditorState.create({ schema: commandSchema, doc, selection: TextSelection.create(doc, 1, paragraphs.reduce((size, node) => size + node.nodeSize, 0) - 1), plugins: [history()] })
    const tr = state.tr
    expect(convertParagraphsToDialogueTransaction(tr)).toBe(true)
    expect(blockLines(tr).map((line: any) => line.content[0].text)).toEqual(['Hello', 'Hi', 'A door opens.'])
    expect(blockLines(tr)[0].content[0].marks[0].type).toBe('bold')
    tr.doc.check()
    state = state.apply(tr)
    expect(undo(state, (transaction) => { state = state.apply(transaction) })).toBe(true)
    expect(state.doc.eq(doc)).toBe(true)
  })
})

describe('dialogue persistence and text extraction', () => {
  it('survives save normalization and a JSON round trip with character metadata and blockId', () => {
    const schema = getSchema([Document, Paragraph, Text, BlockId, DialogueBlockNode, DialogueLineNode])
    const content = createDialogueContent()
    content.attrs = { ...content.attrs, blockId: 'block-dialogue', title: 'A scene', dialogueStyle: 'avatar' }
    const doc = schema.nodeFromJSON({ type: 'doc', content: [content] })
    const saved = normalizeDocForSave(doc.toJSON())
    const restored = schema.nodeFromJSON(JSON.parse(JSON.stringify(saved)))
    expect(restored.eq(doc)).toBe(true)
    expect(restored.firstChild!.attrs.blockId).toBe('block-dialogue')
    expect(restored.firstChild!.childCount).toBe(2)
  })

  it('diffs dialogue line text independently without speaker names', () => {
    const content = createDialogueContent()
    content.content![0]!.content = [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'world', marks: [{ type: 'bold' }] }]
    content.content![1]!.content = [{ type: 'text', text: 'Reply' }]
    const diff = docToDiffText({ type: 'doc', content: [content] })
    expect(diff).toBe('dialogueLine: Hello world\ndialogueLine: Reply')
    expect(diff).not.toContain('Character A')
  })
})

describe('dialogue repair plugin', () => {
  it('repairs injected attrs and orphan lines', () => {
    const schema = getSchema([Document, Paragraph, Text, DialogueBlockNode, DialogueLineNode])
    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'dialogueBlock',
        attrs: { dialogueStyle: 'evil', characters: [{ ...maya, color: 'red;x:y' }] },
        content: [
          { type: 'dialogueLine', attrs: { kind: 'speech', characterId: 'maya' }, content: [{ type: 'text', text: 'Hi' }] },
          { type: 'dialogueLine', attrs: { kind: 'speech', characterId: 'ghost' }, content: [{ type: 'text', text: 'Boo' }] }
        ]
      }]
    })

    const tr = repairDialogueBlocks(EditorState.create({ schema, doc }))
    expect(tr).not.toBeNull()
    const block = tr!.doc.toJSON().content[0]
    expect(block.attrs.dialogueStyle).toBe('compact')
    expect(block.attrs.characters[0].color).toBe(DIALOGUE_PALETTE[0])
    expect(block.content[0].attrs).toEqual({ kind: 'speech', characterId: 'maya' })
    expect(block.content[1].attrs).toEqual({ kind: 'narration', characterId: null })
    expect(block.content[1].content[0].text).toBe('Boo')

    expect(repairDialogueBlocks(EditorState.create({ schema, doc: tr!.doc }))).toBeNull()
  })

  it('seeds two distinct default characters', () => {
    const [first, second] = createDefaultDialogueCharacters()
    expect(first!.id).not.toBe(second!.id)
    expect(first!.color).not.toBe(second!.color)
  })
})
