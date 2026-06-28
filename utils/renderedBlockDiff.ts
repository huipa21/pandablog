import type { JsonContent } from '~/types/content'

export type RenderedBlockDiffStatus = 'unchanged' | 'changed' | 'removed' | 'added'

export interface RenderedBlockDiffRow {
  id: string
  status: RenderedBlockDiffStatus
  oldNode?: JsonContent
  newNode?: JsonContent
  oldIndex?: number
  newIndex?: number
  blockId?: string
  usesFallbackKey: boolean
}

interface BlockDiffItem {
  key: string
  blockId?: string
  node: JsonContent
  index: number
  usesFallbackKey: boolean
}

export function buildRenderedBlockDiff(oldDoc?: JsonContent | null, newDoc?: JsonContent | null): RenderedBlockDiffRow[] {
  const oldItems = docBlocks(oldDoc)
  const newItems = docBlocks(newDoc)
  const oldByKey = new Map(oldItems.map((item) => [item.key, item]))
  const newByKey = new Map(newItems.map((item) => [item.key, item]))

  const rows: RenderedBlockDiffRow[] = newItems.map((newItem) => {
    const oldItem = oldByKey.get(newItem.key)
    if (!oldItem) {
      return {
        id: newItem.key,
        status: 'added',
        newNode: newItem.node,
        newIndex: newItem.index,
        blockId: newItem.blockId,
        usesFallbackKey: newItem.usesFallbackKey
      }
    }

    return {
      id: newItem.key,
      status: stableStringify(oldItem.node) === stableStringify(newItem.node) ? 'unchanged' : 'changed',
      oldNode: oldItem.node,
      newNode: newItem.node,
      oldIndex: oldItem.index,
      newIndex: newItem.index,
      blockId: newItem.blockId ?? oldItem.blockId,
      usesFallbackKey: newItem.usesFallbackKey || oldItem.usesFallbackKey
    }
  })

  for (const oldItem of oldItems) {
    if (newByKey.has(oldItem.key)) continue

    const removedRow: RenderedBlockDiffRow = {
      id: oldItem.key,
      status: 'removed',
      oldNode: oldItem.node,
      oldIndex: oldItem.index,
      blockId: oldItem.blockId,
      usesFallbackKey: oldItem.usesFallbackKey
    }
    const insertAt = rows.findIndex((row) => row.oldIndex !== undefined && row.oldIndex > oldItem.index)
    if (insertAt === -1) rows.push(removedRow)
    else rows.splice(insertAt, 0, removedRow)
  }

  return rows
}

export function hasRenderedBlockChanges(oldDoc?: JsonContent | null, newDoc?: JsonContent | null): boolean {
  return buildRenderedBlockDiff(oldDoc, newDoc).some((row) => row.status !== 'unchanged')
}

function docBlocks(doc?: JsonContent | null): BlockDiffItem[] {
  const children = Array.isArray(doc?.content) ? doc.content : []
  const seen = new Map<string, number>()

  return children.map((node, index) => {
    const blockId = typeof node.attrs?.blockId === 'string' ? node.attrs.blockId.trim() : ''
    const baseKey = blockId || `fallback:${index}:${node.type ?? 'block'}`
    const seenCount = seen.get(baseKey) ?? 0
    seen.set(baseKey, seenCount + 1)

    return {
      key: seenCount === 0 ? baseKey : `${baseKey}:${seenCount + 1}`,
      blockId: blockId || undefined,
      node,
      index,
      usesFallbackKey: !blockId
    }
  })
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}