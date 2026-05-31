import { diffLines } from 'diff'

export const DIFF_BLOCK_LANGUAGES = [
  { value: 'plaintext', label: 'Plain text' },
  { value: 'ios', label: 'Cisco IOS' },
  { value: 'nxos', label: 'Cisco NX-OS' }
] as const

export type DiffBlockLanguage = typeof DIFF_BLOCK_LANGUAGES[number]['value']
export type DiffLineType = 'unchanged' | 'added' | 'removed'

export interface DiffLine {
  id: string
  type: DiffLineType
  oldNumber: number | null
  newNumber: number | null
  content: string
}

type DiffChange = {
  value: string
  added?: boolean
  removed?: boolean
}

const DIFF_LANGUAGE_SET = new Set<string>(DIFF_BLOCK_LANGUAGES.map((language) => language.value))

export const DEFAULT_DIFF_OLD_LABEL = 'Before'
export const DEFAULT_DIFF_NEW_LABEL = 'After'
export const DEFAULT_DIFF_OLD_TEXT = `hostname edge-01
interface Ethernet1/1
  description legacy uplink
  shutdown`
export const DEFAULT_DIFF_NEW_TEXT = `hostname edge-01
interface Ethernet1/1
  description primary uplink
  no shutdown`

export function normalizeDiffLanguage(value: unknown): DiffBlockLanguage {
  const language = typeof value === 'string' ? value : 'plaintext'
  return DIFF_LANGUAGE_SET.has(language) ? language as DiffBlockLanguage : 'plaintext'
}

export function diffLanguageLabel(value: unknown) {
  const language = normalizeDiffLanguage(value)
  return DIFF_BLOCK_LANGUAGES.find((item) => item.value === language)?.label ?? 'Plain text'
}

export function buildDiffLines(oldText: string, newText: string): DiffLine[] {
  const changes = diffLines(normalizeLineEndings(oldText), normalizeLineEndings(newText)) as DiffChange[]
  const lines: DiffLine[] = []
  let oldNumber = 1
  let newNumber = 1
  let rowIndex = 0

  for (const change of changes) {
    const chunkLines = splitChangeLines(change.value)
    for (const content of chunkLines) {
      if (change.added) {
        lines.push({ id: `added-${rowIndex}`, type: 'added', oldNumber: null, newNumber, content })
        newNumber += 1
      } else if (change.removed) {
        lines.push({ id: `removed-${rowIndex}`, type: 'removed', oldNumber, newNumber: null, content })
        oldNumber += 1
      } else {
        lines.push({ id: `unchanged-${rowIndex}`, type: 'unchanged', oldNumber, newNumber, content })
        oldNumber += 1
        newNumber += 1
      }
      rowIndex += 1
    }
  }

  return lines.length ? lines : [{ id: 'empty-0', type: 'unchanged', oldNumber: 1, newNumber: 1, content: '' }]
}

export function diffStats(lines: DiffLine[]) {
  return lines.reduce((stats, line) => {
    if (line.type === 'added') {
      stats.added += 1
    } else if (line.type === 'removed') {
      stats.removed += 1
    }
    return stats
  }, { added: 0, removed: 0 })
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n')
}

function splitChangeLines(value: string) {
  const parts = normalizeLineEndings(value).split('\n')
  if (parts.length > 1 && parts[parts.length - 1] === '') {
    parts.pop()
  }
  return parts.length ? parts : ['']
}
