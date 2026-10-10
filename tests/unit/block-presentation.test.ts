import { describe, expect, it } from 'vitest'
import { normalizeBlockPresentation, importedImagePreset, importedLayoutPreset, mediaFraction, layoutWeights } from '../../utils/blockPresentation'
import { normalizeDocForSave, normalizeDocForComparison } from '../../utils/emptyBlocks'
import { hasRenderedBlockChanges } from '../../utils/renderedBlockDiff'
import { extractBlocksFromDoc, buildDocFromBlocks } from '../../server/utils/blocks'

describe('canonical block presentation', () => {
  it('normalizes on ordinary persistence, not raw reads, and avoids false dirty/diff changes', () => {
    const old = { type: 'doc', content: [{ type: 'image', attrs: { src: '/media/example', displaySize: 'custom-percent', displayPercent: 33, blockId: 'stable', lockAspect: false, height: 99 } }] }
    const before = JSON.stringify(old)
    const current = normalizeBlockPresentation(old)
    expect(normalizeDocForComparison(old)).toEqual(normalizeDocForComparison(current))
    expect(hasRenderedBlockChanges(old, current)).toBe(false)
    expect(normalizeDocForSave(old)?.content?.[0]?.attrs).toEqual({ src: '/media/example', sizePreset: 'small', blockId: 'stable' })
    const blocks = extractBlocksFromDoc(old)
    expect(blocks[0]?.blockId).toBe('stable')
    expect(blocks[0]?.node.attrs).toEqual({ src: '/media/example', sizePreset: 'small', blockId: 'stable' })
    expect(buildDocFromBlocks([{ node: old.content[0] } as any]).content?.[0]).toEqual(old.content[0])
    expect(JSON.stringify(old)).toBe(before)
  })

  it.each([[33, 'small'], [66, 'medium'], [100, 'full'], [200, 'full'], [50, 'medium']])('maps container percentage %s to %s', (percent, preset) => {
    expect(importedImagePreset({ displaySize: 'custom-percent', displayPercent: percent })).toBe(preset)
  })
  it('does not infer container size from pixels or intrinsic width', () => {
    expect(importedImagePreset({ displaySize: 'custom-px', width: 300, widthPercent: 33, naturalWidth: 900 })).toBe('full')
  })
  it('gives canonical presets precedence over stale/malformed legacy values', () => {
    expect(importedImagePreset({ sizePreset: 'small', displaySize: 'fill-container' })).toBe('small')
    expect(importedImagePreset({ sizePreset: 'invalid', widthPercent: 33 })).toBe('full')
    expect(importedImagePreset({ displayPercent: Infinity })).toBe('full')
  })
  it('maps physical layout sides and uses Equal for more than two columns', () => {
    expect(importedLayoutPreset({ customPercentages: '70,30' })).toBe('wider-left')
    expect(importedLayoutPreset({ proportions: '1-2' })).toBe('wider-right')
    expect(importedLayoutPreset({ ratio: 0.7, mediaPosition: 'right' }, 2, true)).toBe('wider-right')
    expect(importedLayoutPreset({ layoutPreset: 'wider-left' }, 3)).toBe('equal')
    expect(mediaFraction('wider-left', 'right')).toBeCloseTo(1 / 3)
    expect(layoutWeights('equal', 6)).toEqual([1, 1, 1, 1, 1, 1])
  })
  it('preserves text, marks, IDs, media byte metadata and unknown nodes without mutating input', () => {
    const doc = { type: 'doc', content: [
      { type: 'mediaText', attrs: { mediaSize: 456, mediaSrc: '/media/example', mediaWidthPercent: 33, ratio: 0.7, blockId: 'id' }, content: [
        { type: 'blockquote', attrs: { theme: 'red', fontSize: '9rem', authorName: 'Author' }, content: [{ type: 'text', text: 'Quote', marks: [{ type: 'bold' }] }] }
      ] },
      { type: 'unknown', attrs: { theme: 'keep' } }
    ] }
    const before = JSON.stringify(doc)
    const normalized = normalizeBlockPresentation(doc)
    expect(JSON.stringify(doc)).toBe(before)
    expect(normalizeBlockPresentation(normalized)).toEqual(normalized)
    expect(normalized.content[0]!.attrs).toEqual({ mediaSize: 456, mediaSrc: '/media/example', blockId: 'id', mediaSizePreset: 'small', layoutPreset: 'wider-left' })
    expect(normalized.content[0]!.content![0]!.attrs).toEqual({ authorName: 'Author', style: 'bar' })
    expect(normalized.content[0]!.content![0]!.content).toEqual(doc.content[0]!.content![0]!.content)
    expect(normalized.content[1]).toEqual(doc.content[1])
  })
  it.each([
    ['codeBlock', { theme: 'nord', zoom: 2, language: 'typescript' }, { language: 'typescript' }],
    ['blockMath', { fontFamily: 'sans', paddingX: 96, latex: 'x' }, { latex: 'x' }],
    ['accordionBlock', { paneStyle: 'dark', marginTop: '10rem', singleOpen: false }, { singleOpen: false }],
    ['dialogueBlock', { marginBottom: '9rem', characters: [{ color: 'blue' }] }, { characters: [{ color: 'blue' }] }]
  ])('retires only decoration for %s', (type, attrs, expected) => {
    expect(normalizeBlockPresentation({ type, attrs }).attrs).toEqual(expected)
  })
})
