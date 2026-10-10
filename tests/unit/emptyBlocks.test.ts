import { describe, expect, it } from 'vitest'
import { isEmptyBlock, normalizeDocForComparison, normalizeDocForSave, stripEmptyBlocks } from '../../utils/emptyBlocks'
import type { JsonContent } from '../../types/content'

describe('empty block stripping', () => {
  it('strips empty text-bearing blocks and keeps text blocks with content', () => {
    const doc: JsonContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [] },
        { type: 'heading', content: [{ type: 'text', text: '  ' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }
      ]
    }

    expect(stripEmptyBlocks(doc)?.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }
    ])
  })

  it('strips empty code blocks but keeps code blocks with code', () => {
    expect(isEmptyBlock({ type: 'codeBlock', content: [{ type: 'text', text: '' }] })).toBe(true)
    expect(isEmptyBlock({ type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1' }] })).toBe(false)
  })

  it('strips media blocks without media payloads', () => {
    expect(isEmptyBlock({ type: 'image', attrs: { src: '' } })).toBe(true)
    expect(isEmptyBlock({ type: 'image', attrs: { src: '/uploads/a.png' } })).toBe(false)
    expect(isEmptyBlock({ type: 'filesBlock', attrs: { files: [] } })).toBe(true)
    expect(isEmptyBlock({ type: 'filesBlock', attrs: { files: [{ name: 'a.pdf' }] } })).toBe(false)
    expect(isEmptyBlock({ type: 'mediaText', attrs: { mediaItems: [] } })).toBe(true)
    expect(isEmptyBlock({ type: 'mediaText', attrs: { mediaItems: [{ src: '/uploads/a.png' }] } })).toBe(false)
  })
})

describe('normalizeDocForSave', () => {
  it('strips empty blocks nested inside container blocks', () => {
    const doc: JsonContent = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [] },
            { type: 'paragraph', content: [{ type: 'text', text: 'kept' }] },
            { type: 'paragraph', content: [{ type: 'text', text: '   ' }] }
          ]
        }
      ]
    }

    expect(normalizeDocForSave(doc)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          attrs: { style: 'bar' },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'kept' }] }
          ]
        }
      ]
    })
  })

  it('trims leading and trailing whitespace at a block edge without collapsing inner spaces', () => {
    const doc: JsonContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '  a  b  ' }] }
      ]
    }

    expect(normalizeDocForSave(doc)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a  b' }] }
      ]
    })
  })

  it('drops a paragraph that becomes empty after whitespace trimming', () => {
    const doc: JsonContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '   ' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'real' }] }
      ]
    }

    expect(normalizeDocForSave(doc)?.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'real' }] }
    ])
  })

  it('preserves blockId attributes and emits a stable key order', () => {
    const doc: JsonContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { textAlign: 'left', blockId: 'abc' }, content: [{ type: 'text', text: 'x' }] }
      ]
    }

    const normalized = normalizeDocForSave(doc)
    expect(normalized?.content?.[0]?.attrs).toEqual({ blockId: 'abc', textAlign: 'left' })
    expect(JSON.stringify(normalized?.content?.[0])).toBe(
      '{"type":"paragraph","attrs":{"blockId":"abc","textAlign":"left"},"content":[{"type":"text","text":"x"}]}'
    )
  })

  it('is idempotent', () => {
    const doc: JsonContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [{ type: 'text', text: '  trim me  ' }] }
      ]
    }

    const once = normalizeDocForSave(doc)
    const twice = normalizeDocForSave(once)
    expect(twice).toEqual(once)
  })
})

describe('normalizeDocForComparison', () => {
  it('treats a raw server doc (with blockIds) and the editor round-trip (no blockIds, trailing paragraph) as equal', () => {
    const serverDoc: JsonContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1, blockId: 'h1' }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', attrs: { blockId: 'p1' }, content: [{ type: 'text', text: 'Body' }] }
      ]
    }

    const editorDoc: JsonContent = {
      type: 'doc',
      content: [
        // Editor emits attrs in a different order and without server blockIds.
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
        // Trailing paragraph auto-added by the editor.
        { type: 'paragraph', content: [] }
      ]
    }

    expect(JSON.stringify(normalizeDocForComparison(serverDoc)))
      .toBe(JSON.stringify(normalizeDocForComparison(editorDoc)))
  })

  it('still detects a real content change', () => {
    const a: JsonContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }
    const b: JsonContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] }

    expect(JSON.stringify(normalizeDocForComparison(a)))
      .not.toBe(JSON.stringify(normalizeDocForComparison(b)))
  })

  it('returns null for empty input', () => {
    expect(normalizeDocForSave(null)).toBeNull()
    expect(normalizeDocForComparison(undefined)).toBeNull()
  })
})
