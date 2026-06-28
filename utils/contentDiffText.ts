import type { JsonContent } from '~/types/content'

const DIFF_BLOCK_CONTAINERS = new Set([
  'doc', 'columnsBlock', 'columnItem', 'tabsBlock', 'tabPanel',
  'accordionBlock', 'accordionPane', 'mediaText', 'footnotesBlock'
])

function nodeText(node?: JsonContent | null): string {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  const children = Array.isArray(node.content) ? node.content : []
  return children.map(nodeText).join('')
}

function blockLabel(node: JsonContent): string {
  const type = node.type ?? 'block'
  const attrs = (node.attrs ?? {}) as Record<string, unknown>
  if (type === 'paragraph') return '¶'
  if (type === 'heading') return `H${attrs.level ?? 1}`
  if (type === 'codeBlock') return attrs.language ? `code:${String(attrs.language)}` : 'code'
  const hint = ['src', 'url', 'fileName', 'alt'].map((key) => attrs[key]).find((value) => typeof value === 'string' && value)
  return hint ? `${type} ${String(hint)}` : type
}

function appendLine(out: string[], depth: number, text: string) {
  out.push(`${'  '.repeat(Math.max(0, depth))}${text}`)
}

function appendInlineBlock(node: JsonContent, depth: number, out: string[]) {
  const label = blockLabel(node)
  const text = nodeText(node)
  if (!text) {
    appendLine(out, depth, label)
  } else if (text.includes('\n')) {
    appendLine(out, depth, label)
    for (const line of text.split('\n')) appendLine(out, depth + 1, line)
  } else {
    appendLine(out, depth, `${label}: ${text}`)
  }
}

function appendCodeBlock(node: JsonContent, depth: number, out: string[]) {
  appendLine(out, depth, blockLabel(node))
  const text = nodeText(node)
  if (!text) return
  for (const line of text.split('\n')) appendLine(out, depth + 1, line)
}

function appendList(node: JsonContent, depth: number, out: string[]) {
  const ordered = node.type === 'orderedList'
  const children = Array.isArray(node.content) ? node.content : []
  children.forEach((child, index) => {
    const marker = ordered ? `${index + 1}.` : '-'
    appendListItem(child, depth, marker, out)
  })
}

function appendListItem(node: JsonContent, depth: number, marker: string, out: string[]) {
  const children = Array.isArray(node.content) ? node.content : []
  const textBlocks = children.filter((child) => child.type !== 'bulletList' && child.type !== 'orderedList')
  const nestedLists = children.filter((child) => child.type === 'bulletList' || child.type === 'orderedList')
  const firstText = textBlocks.map(nodeText).join('').trim()

  appendLine(out, depth, firstText ? `${marker} ${firstText}` : marker)
  for (const nested of nestedLists) appendBlock(nested, depth + 1, out)
}

function appendBlockquote(node: JsonContent, depth: number, out: string[]) {
  const children = Array.isArray(node.content) ? node.content : []
  if (!children.length) {
    appendLine(out, depth, '>')
    return
  }

  for (const child of children) {
    const before = out.length
    appendBlock(child, 0, out)
    const lines = out.splice(before)
    for (const line of lines) appendLine(out, depth, `> ${line}`.trimEnd())
  }
}

function appendTable(node: JsonContent, depth: number, out: string[]) {
  appendLine(out, depth, blockLabel(node))
  const rows = Array.isArray(node.content) ? node.content : []
  rows.forEach((row, rowIndex) => {
    const cells = Array.isArray(row.content) ? row.content : []
    const cellText = cells.map((cell) => nodeText(cell).trim()).join(' | ')
    appendLine(out, depth + 1, `row ${rowIndex + 1}: ${cellText}`.trimEnd())
  })
}

function appendBlock(node: JsonContent, depth: number, out: string[]) {
  const type = node.type ?? ''
  const children = Array.isArray(node.content) ? node.content : []

  if (type === 'codeBlock') {
    appendCodeBlock(node, depth, out)
    return
  }
  if (type === 'bulletList' || type === 'orderedList') {
    appendList(node, depth, out)
    return
  }
  if (type === 'blockquote') {
    appendBlockquote(node, depth, out)
    return
  }
  if (type === 'table') {
    appendTable(node, depth, out)
    return
  }
  if (type && type !== 'doc' && !DIFF_BLOCK_CONTAINERS.has(type)) {
    appendInlineBlock(node, depth, out)
    return
  }

  for (const child of children) appendBlock(child, depth, out)
}

export function docToDiffText(doc?: JsonContent | null): string {
  if (!doc) return ''
  const out: string[] = []
  appendBlock(doc, 0, out)
  return out.join('\n')
}