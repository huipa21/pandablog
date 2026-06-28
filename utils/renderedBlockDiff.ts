import type { JsonContent } from '~/types/content'

export type RenderedBlockDiffStatus = 'unchanged' | 'changed' | 'moved' | 'removed' | 'added'

export interface RenderedBlockDiffRow {
  id: string
  status: RenderedBlockDiffStatus
  oldNode?: JsonContent
  newNode?: JsonContent
  /** Clone of `oldNode` with the differing inner parts marked for display. */
  oldRender?: JsonContent
  /** Clone of `newNode` with the differing inner parts marked for display. */
  newRender?: JsonContent
  oldIndex?: number
  newIndex?: number
  blockId?: string
  usesFallbackKey: boolean
}

export type RenderedDiffPartStatus = 'added' | 'removed' | 'changed'

interface BlockDiffItem {
  key: string
  blockId?: string
  node: JsonContent
  index: number
  usesFallbackKey: boolean
  /** Stable hash of the block content with `blockId` stripped, so identity-only
   *  attribute differences never register as a content change. */
  contentSignature: string
}

interface NewMatch {
  old: BlockDiffItem
  status: 'unchanged' | 'changed' | 'moved'
  matchedById: boolean
}

/**
 * Align two block sequences for the rendered draft comparison.
 *
 * The local draft saved from the editor does not always carry the stable
 * `blockId` attribute that the server mirrors onto reassembled blocks, so a
 * pure id-keyed join would treat every block as added/removed. Matching is
 * therefore done in three passes that degrade gracefully:
 *   1. by `blockId` (order-independent) — stable identity across edits/reorders;
 *   2. by content signature (order-independent) — identical blocks even when one
 *      side has no id;
 *   3. by document position (same node type) — pairs the remaining blocks so an
 *      edited block reads as `changed` instead of removed + added.
 */
export function buildRenderedBlockDiff(oldDoc?: JsonContent | null, newDoc?: JsonContent | null): RenderedBlockDiffRow[] {
  const oldItems = docBlocks(oldDoc)
  const newItems = docBlocks(newDoc)

  const oldUnmatched = new Set(oldItems.map((item) => item.index))
  const newMatch = new Map<number, NewMatch>()

  // Pass 1 — match by stable blockId, regardless of position.
  const oldById = new Map<string, BlockDiffItem[]>()
  for (const item of oldItems) {
    if (!item.blockId) continue
    const list = oldById.get(item.blockId)
    if (list) list.push(item)
    else oldById.set(item.blockId, [item])
  }
  for (const newItem of newItems) {
    if (!newItem.blockId) continue
    const candidates = oldById.get(newItem.blockId)
    const oldItem = candidates?.shift()
    if (!oldItem) continue
    oldUnmatched.delete(oldItem.index)
    newMatch.set(newItem.index, {
      old: oldItem,
      status: oldItem.contentSignature === newItem.contentSignature ? 'unchanged' : 'changed',
      matchedById: true
    })
  }

  markMovedIdMatches(newItems, newMatch)

  // Pass 2 — match remaining blocks by identical content (ignores blockId), so
  // a draft block without an id still aligns with its published counterpart.
  const oldByContent = new Map<string, BlockDiffItem[]>()
  for (const item of oldItems) {
    if (!oldUnmatched.has(item.index)) continue
    const list = oldByContent.get(item.contentSignature)
    if (list) list.push(item)
    else oldByContent.set(item.contentSignature, [item])
  }
  for (const newItem of newItems) {
    if (newMatch.has(newItem.index)) continue
    const candidates = oldByContent.get(newItem.contentSignature)
    const oldItem = candidates?.shift()
    if (!oldItem) continue
    oldUnmatched.delete(oldItem.index)
    newMatch.set(newItem.index, { old: oldItem, status: 'unchanged', matchedById: false })
  }

  // Pass 3 — pair the leftovers positionally (same node type) as `changed`.
  const leftoverNew = newItems.filter((item) => !newMatch.has(item.index))
  const leftoverOld = oldItems.filter((item) => oldUnmatched.has(item.index))
  const pairs = Math.min(leftoverNew.length, leftoverOld.length)
  for (let i = 0; i < pairs; i++) {
    const newItem = leftoverNew[i]!
    const oldItem = leftoverOld[i]!
    if (newItem.node.type !== oldItem.node.type) continue
    oldUnmatched.delete(oldItem.index)
    newMatch.set(newItem.index, { old: oldItem, status: 'changed', matchedById: false })
  }

  const rows: RenderedBlockDiffRow[] = newItems.map((newItem) => {
    const match = newMatch.get(newItem.index)
    if (!match) {
      return {
        id: `new:${newItem.key}`,
        status: 'added',
        newNode: newItem.node,
        newIndex: newItem.index,
        blockId: newItem.blockId,
        usesFallbackKey: newItem.usesFallbackKey
      }
    }

    return {
      id: `new:${newItem.key}`,
      status: match.status,
      oldNode: match.old.node,
      newNode: newItem.node,
      oldIndex: match.old.index,
      newIndex: newItem.index,
      blockId: newItem.blockId ?? match.old.blockId,
      usesFallbackKey: newItem.usesFallbackKey || match.old.usesFallbackKey
    }
  })

  for (const oldItem of oldItems) {
    if (!oldUnmatched.has(oldItem.index)) continue

    const removedRow: RenderedBlockDiffRow = {
      id: `old:${oldItem.key}`,
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

  for (const row of rows) {
    annotateRow(row)
  }

  return rows
}

function markMovedIdMatches(newItems: BlockDiffItem[], newMatch: Map<number, NewMatch>): void {
  const idMatches = newItems
    .map((newItem) => ({ newItem, match: newMatch.get(newItem.index) }))
    .filter((item): item is { newItem: BlockDiffItem; match: NewMatch } => Boolean(item.match?.matchedById))

  if (idMatches.length < 2) return

  const stablePositions = longestIncreasingSubsequencePositions(idMatches.map((item) => item.match.old.index))

  idMatches.forEach((item, position) => {
    if (stablePositions.has(position) || item.match.status === 'changed') return
    item.match.status = 'moved'
  })
}

function longestIncreasingSubsequencePositions(values: number[]): Set<number> {
  if (!values.length) return new Set()

  const predecessors = new Array<number>(values.length).fill(-1)
  const tails: number[] = []

  for (let index = 0; index < values.length; index++) {
    const value = values[index]!
    let low = 0
    let high = tails.length

    while (low < high) {
      const mid = Math.floor((low + high) / 2)
      if (values[tails[mid]!]! < value) low = mid + 1
      else high = mid
    }

    if (low > 0) predecessors[index] = tails[low - 1]!
    tails[low] = index
  }

  const positions = new Set<number>()
  let cursor = tails[tails.length - 1] ?? -1
  while (cursor !== -1) {
    positions.add(cursor)
    cursor = predecessors[cursor]!
  }

  return positions
}

/**
 * Fill `oldRender` / `newRender` on a row with clones whose differing inner
 * parts carry a `diffHighlight` mark, so only the changed text/cells light up
 * instead of the whole block.
 */
function annotateRow(row: RenderedBlockDiffRow): void {
  if (row.status === 'added') {
    row.newRender = row.newNode ? markAll(row.newNode, 'added') : undefined
    return
  }

  if (row.status === 'removed') {
    row.oldRender = row.oldNode ? markAll(row.oldNode, 'removed') : undefined
    return
  }

  if (row.status === 'changed' && row.oldNode && row.newNode) {
    const result = diffNode(row.oldNode, row.newNode)
    row.oldRender = result.old
    row.newRender = result.new
    return
  }

  // Unchanged — render the nodes untouched, no highlight.
  row.oldRender = row.oldNode
  row.newRender = row.newNode
}

interface NodeDiffResult {
  old: JsonContent
  new: JsonContent
  changed: boolean
}

/** Recursively diff two nodes, marking only the parts that differ. */
function diffNode(oldNode: JsonContent, newNode: JsonContent): NodeDiffResult {
  if (oldNode.type !== newNode.type) {
    return { old: markAll(oldNode, 'removed'), new: markAll(newNode, 'added'), changed: true }
  }

  if (newNode.type === 'text') {
    const same = oldNode.text === newNode.text
      && stableStringify(oldNode.marks ?? null) === stableStringify(newNode.marks ?? null)
    if (same) return { old: oldNode, new: newNode, changed: false }
    return { old: markText(oldNode, 'changed'), new: markText(newNode, 'changed'), changed: true }
  }

  if (!Array.isArray(oldNode.content) || !Array.isArray(newNode.content)) {
    const same = signatureOf(oldNode) === signatureOf(newNode)
    if (same) return { old: oldNode, new: newNode, changed: false }
    return { old: markAll(oldNode, 'changed'), new: markAll(newNode, 'changed'), changed: true }
  }

  const childResult = diffChildren(oldNode.content, newNode.content)
  return {
    old: { ...oldNode, content: childResult.oldOut },
    new: { ...newNode, content: childResult.newOut },
    changed: childResult.changed
  }
}

interface ChildDiffResult {
  oldOut: JsonContent[]
  newOut: JsonContent[]
  changed: boolean
}

/**
 * Align two child sequences via an LCS of their content signatures. Matched
 * children render untouched; the gaps between matches are paired positionally
 * (recurse as `changed`) with any leftovers marked added/removed.
 */
function diffChildren(oldCh: JsonContent[], newCh: JsonContent[]): ChildDiffResult {
  const oldSig = oldCh.map(signatureOf)
  const newSig = newCh.map(signatureOf)
  const matches = lcsPairs(oldSig, newSig)

  const oldOut: JsonContent[] = []
  const newOut: JsonContent[] = []
  let changed = false
  let oi = 0
  let ni = 0

  for (const [eoi, eni] of [...matches, [oldCh.length, newCh.length] as [number, number]]) {
    const oldGap = oldCh.slice(oi, eoi)
    const newGap = newCh.slice(ni, eni)
    const pairs = Math.min(oldGap.length, newGap.length)

    for (let k = 0; k < pairs; k++) {
      const result = diffNode(oldGap[k]!, newGap[k]!)
      oldOut.push(result.old)
      newOut.push(result.new)
      changed = changed || result.changed
    }
    for (let k = pairs; k < oldGap.length; k++) {
      oldOut.push(markAll(oldGap[k]!, 'removed'))
      changed = true
    }
    for (let k = pairs; k < newGap.length; k++) {
      newOut.push(markAll(newGap[k]!, 'added'))
      changed = true
    }

    if (eoi < oldCh.length && eni < newCh.length) {
      oldOut.push(oldCh[eoi]!)
      newOut.push(newCh[eni]!)
    }

    oi = eoi + 1
    ni = eni + 1
  }

  return { oldOut, newOut, changed }
}

/** Longest common subsequence of two signature arrays, as [oldIndex, newIndex] pairs. */
function lcsPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length
  const m = b.length
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j]
        ? table[i + 1]![j + 1]! + 1
        : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }

  const pairs: Array<[number, number]> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j])
      i++
      j++
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      i++
    } else {
      j++
    }
  }

  return pairs
}

/** Wrap a single text node's content in a `diffHighlight` mark. */
function markText(node: JsonContent, status: RenderedDiffPartStatus): JsonContent {
  const mark = { type: 'diffHighlight', attrs: { status } }
  return { ...node, marks: [mark, ...(node.marks ?? [])] }
}

/** Recursively mark every text descendant of a node with a `diffHighlight` mark. */
function markAll(node: JsonContent, status: RenderedDiffPartStatus): JsonContent {
  if (node.type === 'text') {
    return markText(node, status)
  }

  if (Array.isArray(node.content)) {
    return { ...node, content: node.content.map((child) => markAll(child, status)) }
  }

  return node
}

function signatureOf(node: JsonContent): string {
  return stableStringify(stripBlockId(node))
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
      usesFallbackKey: !blockId,
      contentSignature: stableStringify(stripBlockId(node))
    }
  })
}

/**
 * Clone a node tree without any `blockId` attribute so two blocks compare equal
 * on their visible content even when only one side carries a stable id.
 */
function stripBlockId(node: JsonContent): JsonContent {
  const next: JsonContent = { ...node }

  if (next.attrs && typeof next.attrs === 'object' && 'blockId' in next.attrs) {
    const { blockId: _blockId, ...rest } = next.attrs
    next.attrs = rest
  }

  if (Array.isArray(next.content)) {
    next.content = next.content.map(stripBlockId)
  }

  return next
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