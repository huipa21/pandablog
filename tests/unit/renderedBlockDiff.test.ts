import { describe, expect, it } from 'vitest'
import { docToDiffText } from '../../utils/contentDiffText'
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

function text(value: string): JsonContent {
  return { type: 'text', text: value }
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

  it('marks reordered stable blocks as moved in local draft order', () => {
    const rows = buildRenderedBlockDiff(doc([paragraph('a', 'A'), paragraph('b', 'B')]), doc([paragraph('b', 'B'), paragraph('a', 'A')]))

    expect(rows.map((row) => row.blockId)).toEqual(['b', 'a'])
    expect(rows.map((row) => row.status)).toEqual(['moved', 'unchanged'])
  })

  it('does not cascade changes when a new local block is inserted between stable ids', () => {
    const published = doc([
      paragraph('a', 'First'),
      paragraph('b', 'Second'),
      paragraph('c', 'Third')
    ])
    const localDraft = doc([
      paragraph('a', 'First'),
      paragraph(undefined, 'Inserted locally'),
      paragraph('b', 'Second'),
      paragraph('c', 'Third')
    ])

    const rows = buildRenderedBlockDiff(published, localDraft)

    expect(rows.map((row) => row.blockId)).toEqual(['a', undefined, 'b', 'c'])
    expect(rows.map((row) => row.status)).toEqual(['unchanged', 'added', 'unchanged', 'unchanged'])
  })

  it('falls back to same-position block type when block ids are absent', () => {
    const rows = buildRenderedBlockDiff(doc([paragraph(undefined, 'Draft')]), doc([paragraph(undefined, 'Draft edited')]))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('changed')
    expect(rows[0]?.usesFallbackKey).toBe(true)
  })

  it('matches by content when a legacy local draft lacks block ids', () => {
    // Local drafts saved before blockId preservation can have no ids while the
    // published doc keeps them. Identical visible content still aligns instead
    // of reading as add + remove.
    const published = doc([
      paragraph('a', 'First'),
      paragraph('b', 'Second'),
      paragraph('c', 'Third')
    ])
    const localDraft = doc([
      paragraph(undefined, 'First'),
      paragraph(undefined, 'Second edited'),
      paragraph(undefined, 'Third')
    ])

    const rows = buildRenderedBlockDiff(published, localDraft)

    expect(rows.map((row) => row.status)).toEqual(['unchanged', 'changed', 'unchanged'])
  })

  it('aligns identical blocks even when new content is prepended without ids', () => {
    const published = doc([paragraph('a', 'Kept one'), paragraph('b', 'Kept two')])
    const localDraft = doc([
      paragraph(undefined, 'Brand new intro'),
      paragraph(undefined, 'Kept one'),
      paragraph(undefined, 'Kept two')
    ])

    const rows = buildRenderedBlockDiff(published, localDraft)

    expect(rows.map((row) => row.status)).toEqual(['added', 'unchanged', 'unchanged'])
  })

  it('detects whether any rendered block rows changed', () => {
    expect(hasRenderedBlockChanges(doc([paragraph('a', 'Same')]), doc([paragraph('a', 'Same')]))).toBe(false)
    expect(hasRenderedBlockChanges(doc([paragraph('a', 'Same')]), doc([paragraph('a', 'Different')]))).toBe(true)
  })
})

describe('docToDiffText', () => {
  it('serializes basic block labels and text', () => {
    expect(docToDiffText(doc([
      { type: 'heading', attrs: { level: 2 }, content: [text('Title')] },
      paragraph(undefined, 'Body text')
    ]))).toBe('H2: Title\n¶: Body text')
  })

  it('preserves code block lines under the code label', () => {
    expect(docToDiffText(doc([
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1\nconst b = 2')] }
    ]))).toBe('code:ts\n  const a = 1\n  const b = 2')
  })

  it('marks blockquote content as quoted lines', () => {
    expect(docToDiffText(doc([
      { type: 'blockquote', content: [paragraph(undefined, 'Quoted text')] }
    ]))).toBe('> ¶: Quoted text')
  })

  it('preserves list markers and nested list indentation', () => {
    expect(docToDiffText(doc([
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [paragraph(undefined, 'Parent'), { type: 'orderedList', content: [{ type: 'listItem', content: [paragraph(undefined, 'Child')] }] }] }
        ]
      }
    ]))).toBe('- Parent\n  1. Child')
  })

  it('serializes table rows and cells with separators', () => {
    expect(docToDiffText(doc([
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', content: [paragraph(undefined, 'Header 1')] }, { type: 'tableHeader', content: [paragraph(undefined, 'Header 2')] }] },
          { type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph(undefined, 'Cell 1')] }, { type: 'tableCell', content: [paragraph(undefined, 'Cell 2')] }] }
        ]
      }
    ]))).toBe('table\n  row 1: Header 1 | Header 2\n  row 2: Cell 1 | Cell 2')
  })
})