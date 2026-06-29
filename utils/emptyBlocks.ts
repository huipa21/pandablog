import type { JsonContent } from '~/types/content'

const TEXT_BEARING_BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem'
])

export function stripEmptyBlocks(doc: JsonContent | null | undefined): JsonContent | null {
  if (!doc) return null
  if (!Array.isArray(doc.content)) return doc

  return {
    ...doc,
    content: doc.content.filter((node) => !isEmptyBlock(node))
  }
}

export function isEmptyBlock(node: JsonContent | null | undefined): boolean {
  if (!node || !node.type) return true

  if (TEXT_BEARING_BLOCK_TYPES.has(node.type)) {
    return flattenText(node).trim().length === 0
  }

  if (node.type === 'codeBlock') {
    return flattenText(node).trim().length === 0
  }

  if (node.type === 'image') {
    return stringAttr(node.attrs?.src).length === 0
  }

  if (node.type === 'mediaText') {
    return !hasItems(node.attrs?.mediaItems) && stringAttr(node.attrs?.mediaSrc).length === 0 && stringAttr(node.attrs?.src).length === 0
  }

  if (node.type === 'filesBlock') {
    return !hasItems(node.attrs?.files)
  }

  return false
}

function flattenText(node: JsonContent | null | undefined): string {
  if (!node) return ''
  const ownText = typeof node.text === 'string' ? node.text : ''
  const childText = Array.isArray(node.content) ? node.content.map(flattenText).join('') : ''
  return `${ownText}${childText}`
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => Boolean(item && typeof item === 'object'))
}

function stringAttr(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}