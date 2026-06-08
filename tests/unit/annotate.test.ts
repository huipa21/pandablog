import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { annotate, type ReadingSegment } from '../../server/utils/annotate'

function rubySegments(segments: ReadingSegment[]) {
  return segments.filter((segment): segment is Extract<ReadingSegment, { kind: 'ruby' }> => segment.kind === 'ruby')
}

function renderedText(segments: ReadingSegment[]) {
  return segments.map((segment) => segment.kind === 'ruby' ? segment.base : segment.text).join('')
}

function hasKuromojiDict() {
  return existsSync(resolve(process.cwd(), 'public/dict/base.dat.gz'))
    || existsSync(resolve(process.cwd(), '.output/public/dict/base.dat.gz'))
}

describe('annotate', () => {
  it('returns no segments for empty text', async () => {
    await expect(annotate('', 'cmn')).resolves.toEqual([])
  })

  it('annotates Mandarin Han characters with pinyin readings', async () => {
    const segments = await annotate('你好', 'cmn')
    const ruby = rubySegments(segments)

    expect(renderedText(segments)).toBe('你好')
    expect(ruby).toHaveLength(2)
    expect(ruby.every((segment) => segment.reading.length > 0)).toBe(true)
  })

  it('annotates Cantonese Han characters with jyutping readings', async () => {
    const segments = await annotate('你好嗎', 'yue')
    const ruby = rubySegments(segments)

    expect(renderedText(segments)).toBe('你好嗎')
    expect(ruby).toHaveLength(3)
    expect(ruby.every((segment) => segment.reading.length > 0)).toBe(true)
  })

  const runWithDict = hasKuromojiDict() ? it : it.skip

  runWithDict('annotates Japanese kanji with hiragana readings', async () => {
    const segments = await annotate('漢字とひらがな', 'jpn')
    const ruby = rubySegments(segments)

    expect(renderedText(segments)).toBe('漢字とひらがな')
    expect(ruby.length).toBeGreaterThan(0)
    expect(ruby.some((segment) => segment.base.includes('漢') && segment.reading.length > 0)).toBe(true)
  })
})