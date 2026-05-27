import { createHash, randomUUID } from 'node:crypto'
import type { Surreal } from 'surrealdb'
import type { BlockRecord, JsonContent } from '~/types/content'
import { queryDb } from './db'
import { firstRow, queryRows, recordIdPart, stringifyRecordId } from './surrealResult'

/** Default sequence step between adjacent blocks after a full renumber. */
export const BLOCK_SEQ_STEP = 10

const BLOCK_ID_ATTR = 'blockId'

/**
 * Build an empty Tiptap doc — used when a post has no blocks.
 */
export function emptyDoc(): JsonContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: []
      }
    ]
  }
}

/**
 * Recursively flatten visible text from any Tiptap node — used for FTS
 * indexing on the `block` row. Handles known custom node types so their
 * referenced labels make it into the index.
 */
export function flattenNodeText(node: JsonContent | null | undefined): string {
  if (!node) {
    return ''
  }

  if (node.type === 'text') {
    return node.text ?? ''
  }

  if (node.type === 'relatedPost' || node.type === 'wikiLink') {
    return stringAttr(node.attrs?.label) || stringAttr(node.attrs?.target)
  }

  if (node.type === 'mermaid') {
    return stringAttr(node.attrs?.code)
  }

  if (node.type === 'image') {
    return [stringAttr(node.attrs?.alt), stringAttr(node.attrs?.title)].filter(Boolean).join(' ')
  }

  if (node.type === 'customHtml') {
    return stringAttr(node.attrs?.html)
  }

  const ownText = typeof node.text === 'string' ? node.text : ''
  const childText = node.content?.map(flattenNodeText).filter(Boolean).join(' ') ?? ''
  return [ownText, childText].filter(Boolean).join(' ').trim()
}

/**
 * A top-level node staged for saving. The blockId is stable across edits.
 */
export interface BlockInput {
  blockId: string
  node: JsonContent
  text: string
  hash: string
}

/**
 * Extract top-level blocks from a Tiptap doc, ensuring each carries a
 * stable `blockId` attribute. New blocks get a freshly minted id.
 */
export function extractBlocksFromDoc(doc: JsonContent | null | undefined): BlockInput[] {
  const blocks: BlockInput[] = []
  const seen = new Set<string>()

  if (!doc?.content) {
    return blocks
  }

  for (const raw of doc.content) {
    if (!raw || typeof raw !== 'object') {
      continue
    }

    const attrs = (raw.attrs && typeof raw.attrs === 'object') ? { ...raw.attrs } : {}
    let blockId = typeof attrs[BLOCK_ID_ATTR] === 'string' ? String(attrs[BLOCK_ID_ATTR]).trim() : ''

    if (!blockId || seen.has(blockId)) {
      blockId = randomUUID().replace(/-/g, '')
    }

    seen.add(blockId)
    attrs[BLOCK_ID_ATTR] = blockId

    const node: JsonContent = { ...raw, attrs }
    const text = flattenNodeText(node)
    const hash = hashNode(node)

    blocks.push({ blockId, node, text, hash })
  }

  return blocks
}

/**
 * Reassemble a Tiptap doc from an ordered list of stored blocks.
 */
export function buildDocFromBlocks(blocks: BlockRecord[]): JsonContent {
  if (!blocks.length) {
    return emptyDoc()
  }

  return {
    type: 'doc',
    content: blocks.map((block) => block.node)
  }
}

/**
 * Stable JSON hash of a node — used for diffing blocks on save so the server
 * only writes blocks whose content has actually changed.
 */
export function hashNode(node: JsonContent): string {
  return createHash('sha256').update(stableStringify(node)).digest('hex')
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
  return `{${entries.join(',')}}`
}

function stringAttr(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

interface ExistingBlockRow {
  id: unknown
  type?: unknown
  node?: unknown
  text?: unknown
  content_hash?: unknown
  seq?: unknown
}

/**
 * Load all blocks belonging to a post, in sequence order, including their
 * edge sequence number.
 */
export async function loadBlocksForPost(db: Surreal, postRecordId: string): Promise<BlockRecord[]> {
  const postId = recordIdPart(postRecordId, 'post')
  const response = await queryDb(
    db,
    `SELECT seq, out FROM has_blocks
     WHERE in = type::record('post', $postId)
     ORDER BY seq ASC
     FETCH out;`,
    { postId }
  )
  const rows = queryRows<{ seq?: unknown, out?: ExistingBlockRow }>(response, 0)
  return rows
    .filter((row) => row.out && typeof row.out === 'object')
    .map((row) => {
      const out = row.out as ExistingBlockRow
      return {
        id: stringifyRecordId(out.id),
        type: String(out.type ?? 'paragraph'),
        node: (out.node && typeof out.node === 'object' ? out.node : {}) as JsonContent,
        text: String(out.text ?? ''),
        seq: Number(row.seq ?? 0)
      }
    })
}

/**
 * Diff the incoming ordered block list against the post's existing blocks and
 * apply the minimal set of operations:
 *  - delete blocks that are no longer present
 *  - create blocks that are new (assigning a fresh seq via halving)
 *  - update blocks whose content_hash changed
 *  - reseq edges whenever ordering changed
 *
 * Returns the final ordered BlockRecord list after the diff is applied.
 */
export async function syncPostBlocks(
  db: Surreal,
  postRecordId: string,
  incoming: BlockInput[]
): Promise<BlockRecord[]> {
  const postId = recordIdPart(postRecordId, 'post')
  const existing = await loadBlocksForPost(db, postRecordId)
  const existingById = new Map(existing.map((block) => [block.id, block]))
  const incomingIds = new Set(incoming.map((b) => b.blockId).map((id) => `block:${id}`))

  // Delete blocks that are no longer present (also removes their has_blocks edges).
  for (const block of existing) {
    if (!incomingIds.has(block.id)) {
      const blockId = recordIdPart(block.id, 'block')
      await queryDb(db, "DELETE has_blocks WHERE out = type::record('block', $blockId);", { blockId })
      await queryDb(db, "DELETE type::record('block', $blockId);", { blockId })
    }
  }

  // Upsert each incoming block and (re)create the edge with a fresh sequence.
  // We always do a full renumber (10, 20, 30, ...) on bulk save — the
  // halving algorithm is used by the granular insert/reorder endpoints.
  const finalBlocks: BlockRecord[] = []
  for (let i = 0; i < incoming.length; i += 1) {
    const incomingBlock = incoming[i]!
    const seq = (i + 1) * BLOCK_SEQ_STEP
    const blockRecordId = `block:${incomingBlock.blockId}`
    const prior = existingById.get(blockRecordId)
    const blockType = String(incomingBlock.node.type ?? 'paragraph')

    if (!prior) {
      // CREATE block with an explicit id, then RELATE post -> block with seq.
      await queryDb(
        db,
        `CREATE type::record('block', $blockId) CONTENT {
          type: $type,
          node: $node,
          text: $text,
          content_hash: $hash,
          created_at: time::now(),
          updated_at: time::now()
        };`,
        {
          blockId: incomingBlock.blockId,
          type: blockType,
          node: incomingBlock.node,
          text: incomingBlock.text,
          hash: incomingBlock.hash
        }
      )
      await queryDb(
        db,
        `RELATE (type::record('post', $postId)) -> has_blocks -> (type::record('block', $blockId)) CONTENT { seq: $seq };`,
        { postId, blockId: incomingBlock.blockId, seq }
      )
    } else {
      if (prior.text !== incomingBlock.text || hashNode(prior.node) !== incomingBlock.hash) {
        await queryDb(
          db,
          `UPDATE type::record('block', $blockId) MERGE {
            type: $type,
            node: $node,
            text: $text,
            content_hash: $hash,
            updated_at: time::now()
          };`,
          {
            blockId: incomingBlock.blockId,
            type: blockType,
            node: incomingBlock.node,
            text: incomingBlock.text,
            hash: incomingBlock.hash
          }
        )
      }

      if (prior.seq !== seq) {
        await queryDb(
          db,
          `UPDATE has_blocks SET seq = $seq WHERE in = type::record('post', $postId) AND out = type::record('block', $blockId);`,
          { postId, blockId: incomingBlock.blockId, seq }
        )
      }
    }

    finalBlocks.push({
      id: blockRecordId,
      type: blockType,
      node: incomingBlock.node,
      text: incomingBlock.text,
      seq
    })
  }

  return finalBlocks
}

/**
 * Delete every block (and edge) belonging to a post — used when a post is
 * hard-deleted. Archive flow keeps blocks intact.
 */
export async function deleteAllBlocksForPost(db: Surreal, postRecordId: string) {
  const postId = recordIdPart(postRecordId, 'post')
  const response = await queryDb(
    db,
    "SELECT out AS id FROM has_blocks WHERE in = type::record('post', $postId);",
    { postId }
  )
  const blockIds = queryRows<{ id: unknown }>(response, 0).map((row) => stringifyRecordId(row.id))

  await queryDb(db, "DELETE has_blocks WHERE in = type::record('post', $postId);", { postId })
  await Promise.all(blockIds.map((fullId) => {
    const blockId = recordIdPart(fullId, 'block')
    return queryDb(db, "DELETE type::record('block', $blockId);", { blockId })
  }))
}

/* ---------- Sequence math: halving + full renumber ---------- */

/**
 * Compute a new sequence number for a block inserted between two adjacent
 * blocks (either of which may be undefined for head/tail insert).
 * Rules (per spec):
 *  - tail insert: prev + STEP
 *  - head insert: next - STEP (clamped to at least 1)
 *  - middle:     floor((prev + next) / 2)
 *  - if the gap to either neighbour collapses to <= 1, the caller should
 *    full-renumber the post (`renumberPostBlocks`).
 */
export function computeInsertSeq(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) {
    return BLOCK_SEQ_STEP
  }
  if (next === undefined) {
    return (prev ?? 0) + BLOCK_SEQ_STEP
  }
  if (prev === undefined) {
    return Math.max(1, next - BLOCK_SEQ_STEP)
  }
  return Math.floor((prev + next) / 2)
}

/**
 * Returns true when the gap between two seq values is too small to safely
 * insert another block between them, meaning the caller should re-stripe.
 */
export function seqGapTooTight(prev: number | undefined, next: number | undefined): boolean {
  if (prev === undefined || next === undefined) {
    return false
  }
  return next - prev <= 1
}

/**
 * Reset all `has_blocks.seq` values for a post back to a clean 10/20/30...
 * stripe, preserving current order.
 */
export async function renumberPostBlocks(db: Surreal, postRecordId: string): Promise<BlockRecord[]> {
  const postId = recordIdPart(postRecordId, 'post')
  const blocks = await loadBlocksForPost(db, postRecordId)

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!
    const seq = (i + 1) * BLOCK_SEQ_STEP
    const blockId = recordIdPart(block.id, 'block')
    await queryDb(
      db,
      `UPDATE has_blocks SET seq = $seq WHERE in = type::record('post', $postId) AND out = type::record('block', $blockId);`,
      { postId, blockId, seq }
    )
    block.seq = seq
  }

  return blocks
}

/**
 * Swap the seq numbers of two blocks (used by reorder when moving by one
 * position).
 */
export async function swapBlockSeq(db: Surreal, postRecordId: string, blockIdA: string, blockIdB: string) {
  const postId = recordIdPart(postRecordId, 'post')
  const a = recordIdPart(blockIdA, 'block')
  const b = recordIdPart(blockIdB, 'block')

  const response = await queryDb(
    db,
    `SELECT out AS id, seq FROM has_blocks
     WHERE in = type::record('post', $postId)
       AND out IN [type::record('block', $a), type::record('block', $b)];`,
    { postId, a, b }
  )
  const rows = queryRows<{ id: unknown, seq?: number }>(response, 0)
  const seqByBlock = new Map(rows.map((row) => [stringifyRecordId(row.id), Number(row.seq ?? 0)]))
  const seqA = seqByBlock.get(`block:${a}`)
  const seqB = seqByBlock.get(`block:${b}`)

  if (seqA === undefined || seqB === undefined) {
    throw createError({ statusCode: 404, message: 'Block not found on post' })
  }

  await queryDb(
    db,
    `UPDATE has_blocks SET seq = $seqB WHERE in = type::record('post', $postId) AND out = type::record('block', $a);`,
    { postId, a, seqB }
  )
  await queryDb(
    db,
    `UPDATE has_blocks SET seq = $seqA WHERE in = type::record('post', $postId) AND out = type::record('block', $b);`,
    { postId, b, seqA }
  )
}

/* ---------- Inter-post links ---------- */

/**
 * Sync the bidirectional `links` edge for a post from the `relatedPost`
 * blocks present in its content. Each target slug becomes both
 * postA -> links -> postB and postB -> links -> postA.
 */
export async function syncPostLinks(db: Surreal, postRecordId: string, blocks: BlockInput[] | BlockRecord[]) {
  const postId = recordIdPart(postRecordId, 'post')
  const targetSlugs = new Set<string>()

  for (const block of blocks) {
    collectRelatedSlugs(('node' in block ? block.node : null) as JsonContent | null, targetSlugs)
  }

  // Clear edges originating from this post (both directions).
  await queryDb(
    db,
    `DELETE links WHERE in = type::record('post', $postId) OR out = type::record('post', $postId);`,
    { postId }
  )

  if (!targetSlugs.size) {
    return [] as string[]
  }

  const resolved = await queryDb(
    db,
    'SELECT id, slug FROM post WHERE slug IN $slugs;',
    { slugs: Array.from(targetSlugs) }
  )
  const matches = queryRows<{ id: unknown, slug?: unknown }>(resolved, 0)

  for (const match of matches) {
    const targetId = recordIdPart(stringifyRecordId(match.id), 'post')
    if (targetId === postId) {
      continue
    }
    await queryDb(
      db,
      `RELATE (type::record('post', $postId)) -> links -> (type::record('post', $targetId));`,
      { postId, targetId }
    )
    await queryDb(
      db,
      `RELATE (type::record('post', $targetId)) -> links -> (type::record('post', $postId));`,
      { postId, targetId }
    )
  }

  return matches.map((m) => String(m.slug ?? '')).filter(Boolean)
}

function collectRelatedSlugs(node: JsonContent | null | undefined, out: Set<string>) {
  if (!node) {
    return
  }
  if (node.type === 'relatedPost') {
    const target = typeof node.attrs?.target === 'string' ? node.attrs.target.trim() : ''
    if (target) {
      out.add(target)
    }
  }
  node.content?.forEach((child) => collectRelatedSlugs(child, out))
}
