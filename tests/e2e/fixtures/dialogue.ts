import type { JSONContent } from '@tiptap/core'
import { DIALOGUE_PALETTE, type DialogueStyle } from '../../../extensions/dialogueBlock'

export const dialogueCharacters = [
  { id: 'maya', name: 'Maya With A Very Long Speaker Name', color: DIALOGUE_PALETTE[0], avatarMediaId: null, avatarSrc: null },
  { id: 'alex', name: 'Alex', color: DIALOGUE_PALETTE[1], avatarMediaId: null, avatarSrc: null }
]

export function dialogueFixture(dialogueStyle: DialogueStyle = 'compact'): JSONContent {
  return {
    type: 'dialogueBlock',
    attrs: { title: 'The hallway', dialogueStyle, characters: dialogueCharacters, marginTop: '1rem', marginBottom: '1rem' },
    content: [
      { type: 'dialogueLine', attrs: { kind: 'speech', characterId: 'maya' }, content: [
        { type: 'text', text: 'Are you sure ', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'this is the right place?', marks: [{ type: 'link', attrs: { href: 'https://example.com', openMode: 'same-tab' } }] }
      ] },
      { type: 'dialogueLine', attrs: { kind: 'speech', characterId: 'alex' }, content: [{ type: 'text', text: 'AlreadyHere'.repeat(40) }] },
      { type: 'dialogueLine', attrs: { kind: 'narration', characterId: null }, content: [{ type: 'text', text: 'They looked toward the dark hallway.' }] },
      { type: 'dialogueLine', attrs: { kind: 'thought', characterId: 'maya' }, content: [{ type: 'text', text: 'Something is not right.', marks: [{ type: 'italic' }] }] }
    ]
  }
}
