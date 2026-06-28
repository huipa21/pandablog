import { describe, expect, it } from 'vitest'
import { buildRenderedBlockDiff, hasRenderedBlockChanges } from '../../utils/renderedBlockDiff'
import type { JsonContent } from '~/types/content'

function doc(content: JsonContent[]): JsonContent {
  return { type: 'doc', content }
}

function paragraph(blockId: string | undefined, text: string): JsonContent {
  return {
    type: 'paragraph',
    attrs: blockId ? { blockId } : {},
    content: [{ type: 'text', text }]
  }
}

describe('buildRenderedBlockDiff', () => {
  it('marks matching block ids with identical content as unchanged', () => {
    const rows = buildRenderedBlockDiff(doc([paragraph('a', 'Hello')]), doc([paragraph('a', 'Hello')]))

    expect(rows).toMatchObject([{ status: 'unchanged', blockId: 'a', oldIndex: 0, newIndex: 0 }])
  })

  it('marks matching block ids with different content as changed', () => {
    const rows = buildRenderedBlockDiff(doc([paragraph('a', 'Hello')]), doc([paragraph('a', 'Hello again')]))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('changed')
    expect(rows[0]?.oldNode).toBeTruthy()
    expect(rows[0]?.newNode).toBeTruthy()
  })

  it('marks blocks missing from the local draft as removed', () => {
    const rows = buildRenderedBlockDiff(doc([paragraph('a', 'Keep'), paragraph('b', 'Remove')]), doc([paragraph('a', 'Keep')]))

    expect(rows.map((row) => row.status)).toEqual(['unchanged', 'removed'])
    expect(rows[1]?.blockId).toBe('b')
    expect(rows[1]?.oldNode).toBeTruthy()
    expect(rows[1]?.newNode).toBeUndefined()
  })

  it('marks local draft-only blocks as added', () => {
    const rows = buildRenderedBlockDiff(doc([paragraph('a', 'Keep')]), doc([paragraph('a', 'Keep'), paragraph('b', 'Add')]))

    expect(rows.map((row) => row.status)).toEqual(['unchanged', 'added'])
    expect(rows[1]?.blockId).toBe('b')
    expect(rows[1]?.oldNode).toBeUndefined()
    expect(rows[1]?.newNode).toBeTruthy()
  })

  it('keeps reordered stable blocks in local draft order', () => {
    const rows = buildRenderedBlockDiff(doc([paragraph('a', 'A'), paragraph('b', 'B')]), doc([paragraph('b', 'B'), paragraph('a', 'A')]))

    expect(rows.map((row) => row.blockId)).toEqual(['b', 'a'])
    expect(rows.map((row) => row.status)).toEqual(['unchanged', 'unchanged'])
  })

  it('falls back to same-position block type when block ids are absent', () => {
    const rows = buildRenderedBlockDiff(doc([paragraph(undefined, 'Draft')]), doc([paragraph(undefined, 'Draft edited')]))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('changed')
    expect(rows[0]?.usesFallbackKey).toBe(true)
  })

  it('detects whether any rendered block rows changed', () => {
    expect(hasRenderedBlockChanges(doc([paragraph('a', 'Same')]), doc([paragraph('a', 'Same')]))).toBe(false)
    expect(hasRenderedBlockChanges(doc([paragraph('a', 'Same')]), doc([paragraph('a', 'Different')]))).toBe(true)
  })
})