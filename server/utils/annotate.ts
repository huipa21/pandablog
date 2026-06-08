import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export const ANNOT_LANGS = ['cmn', 'yue', 'jpn'] as const

export type AnnotLang = typeof ANNOT_LANGS[number]

export type ReadingSegment =
  | { kind: 'ruby', base: string, reading: string }
  | { kind: 'text', text: string }

interface ReadingEngine {
  annotate: (text: string) => Promise<ReadingSegment[]>
}

interface KuroshiroInstance {
  init: (analyzer: unknown) => Promise<void>
  convert: (text: string, opts: { mode: 'furigana', to: 'hiragana' }) => Promise<string>
}

const HAN_REGEX = /\p{Script=Han}/u
const KUROMOJI_DICT_FILES = [
  'base.dat.gz',
  'check.dat.gz',
  'tid.dat.gz',
  'tid_pos.dat.gz',
  'tid_map.dat.gz',
  'cc.dat.gz',
  'unk.dat.gz',
  'unk_pos.dat.gz',
  'unk_map.dat.gz',
  'unk_char.dat.gz',
  'unk_compat.dat.gz',
  'unk_invoke.dat.gz'
] as const

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"'
}

const engineCache = new Map<AnnotLang, Promise<ReadingEngine>>()

let kuroshiroInstance: KuroshiroInstance | null = null
let kuroshiroInitPromise: Promise<KuroshiroInstance> | null = null

export async function annotate(text: string, lang: AnnotLang): Promise<ReadingSegment[]> {
  if (!text) return []

  const engine = await getEngine(lang)
  return engine.annotate(text)
}

async function getEngine(lang: AnnotLang): Promise<ReadingEngine> {
  let cached = engineCache.get(lang)
  if (cached) return cached

  cached = createEngine(lang)
  engineCache.set(lang, cached)

  try {
    return await cached
  } catch (error) {
    engineCache.delete(lang)
    throw error
  }
}

async function createEngine(lang: AnnotLang): Promise<ReadingEngine> {
  switch (lang) {
    case 'cmn': return createMandarinEngine()
    case 'yue': return createCantoneseEngine()
    case 'jpn': return createJapaneseEngine()
    default: throw new Error(`Unsupported annotation language: ${lang satisfies never}`)
  }
}

async function createMandarinEngine(): Promise<ReadingEngine> {
  const { pinyin } = await import('pinyin-pro')

  return {
    annotate(text: string) {
      return Promise.resolve(annotatePerCharacter(text, (chars) => {
        const result = pinyin(chars.join(''), {
          type: 'array',
          toneType: 'symbol',
          v: true
        })
        return result.map((reading) => String(reading ?? ''))
      }))
    }
  }
}

async function createCantoneseEngine(): Promise<ReadingEngine> {
  const mod = await import('to-jyutping')
  const getJyutpingList = (mod as { getJyutpingList?: unknown }).getJyutpingList

  if (typeof getJyutpingList !== 'function') {
    throw new Error('to-jyutping does not export getJyutpingList')
  }

  return {
    annotate(text: string) {
      return Promise.resolve(annotatePerCharacter(text, (chars) => {
        const result = (getJyutpingList as (input: string) => Array<[string, string | null]>)(chars.join(''))
        return chars.map((_, index) => {
          const entry = result[index]
          const reading = entry?.[1]
          return typeof reading === 'string' ? reading : ''
        })
      }))
    }
  }
}

async function createJapaneseEngine(): Promise<ReadingEngine> {
  const kuroshiro = await getKuroshiro()

  return {
    async annotate(text: string) {
      if (!text) return []

      const html = await kuroshiro.convert(text, { mode: 'furigana', to: 'hiragana' })
      return parseFuriganaHtml(html)
    }
  }
}

async function getKuroshiro(): Promise<KuroshiroInstance> {
  if (kuroshiroInstance) return kuroshiroInstance
  if (kuroshiroInitPromise) return kuroshiroInitPromise

  kuroshiroInitPromise = (async () => {
    const KuroshiroMod = await import('kuroshiro')
    const AnalyzerMod = await import('kuroshiro-analyzer-kuromoji')

    const KuroshiroCtor = unwrapDefault(KuroshiroMod) as new () => KuroshiroInstance
    const AnalyzerCtor = unwrapDefault(AnalyzerMod) as new (opts?: { dictPath?: string }) => unknown

    const instance = new KuroshiroCtor()
    const analyzer = new AnalyzerCtor({ dictPath: resolveKuromojiDictPath() })
    await instance.init(analyzer)

    kuroshiroInstance = instance
    return instance
  })()

  try {
    return await kuroshiroInitPromise
  } catch (error) {
    kuroshiroInitPromise = null
    throw error
  }
}

function resolveKuromojiDictPath(): string {
  const candidates = [
    resolve(process.cwd(), '.output/public/dict'),
    resolve(process.cwd(), 'public/dict')
  ]

  const found = candidates.find(hasKuromojiDict)
  if (found) return found

  throw new Error('Kuromoji dictionary files were not found in .output/public/dict or public/dict')
}

function hasKuromojiDict(path: string): boolean {
  return KUROMOJI_DICT_FILES.every((file) => existsSync(resolve(path, file)))
}

function unwrapDefault(value: unknown): unknown {
  if (value && typeof value === 'object' && 'default' in value) {
    return unwrapDefault((value as { default: unknown }).default)
  }

  return value
}

function annotatePerCharacter(text: string, getReadings: (chars: string[]) => string[]): ReadingSegment[] {
  if (!text) return []

  const chars = Array.from(text)
  const segments: ReadingSegment[] = []
  let textRun = ''

  const hanChars: string[] = []
  const positions: number[] = []
  chars.forEach((ch, index) => {
    if (HAN_REGEX.test(ch)) {
      hanChars.push(ch)
      positions.push(index)
    }
  })

  const readings = hanChars.length > 0 ? getReadings(hanChars) : []
  const readingByPosition = new Map<number, string>()
  positions.forEach((pos, index) => {
    readingByPosition.set(pos, readings[index] ?? '')
  })

  chars.forEach((ch, index) => {
    if (HAN_REGEX.test(ch)) {
      if (textRun) {
        segments.push({ kind: 'text', text: textRun })
        textRun = ''
      }
      segments.push({ kind: 'ruby', base: ch, reading: readingByPosition.get(index) ?? '' })
    } else {
      textRun += ch
    }
  })

  if (textRun) segments.push({ kind: 'text', text: textRun })

  return segments
}

function parseFuriganaHtml(html: string): ReadingSegment[] {
  if (!html) return []

  const segments: ReadingSegment[] = []
  const rubyRegex = /<ruby>([\s\S]*?)<\/ruby>/gi
  let cursor = 0

  for (const match of html.matchAll(rubyRegex)) {
    const index = match.index ?? 0
    appendTextSegment(segments, html.slice(cursor, index))

    const ruby = parseRubyInnerHtml(match[1] ?? '')
    if (ruby) segments.push(ruby)

    cursor = index + match[0].length
  }

  appendTextSegment(segments, html.slice(cursor))

  return mergeAdjacentText(segments)
}

function parseRubyInnerHtml(innerHtml: string): ReadingSegment | null {
  const rtMatch = /<rt>([\s\S]*?)<\/rt>/i.exec(innerHtml)
  const reading = decodeHtml(stripRubyTags(rtMatch?.[1] ?? ''))
  const base = decodeHtml(stripRubyTags(
    innerHtml
      .replace(/<rt>[\s\S]*?<\/rt>/gi, '')
      .replace(/<rp>[\s\S]*?<\/rp>/gi, '')
  ))

  if (!base) return null
  return { kind: 'ruby', base, reading }
}

function appendTextSegment(segments: ReadingSegment[], rawText: string) {
  if (!rawText) return

  const text = decodeHtml(rawText)
  if (text) segments.push({ kind: 'text', text })
}

function stripRubyTags(value: string): string {
  return value.replace(/<\/?(?:ruby|rt|rp)>/gi, '')
}

function decodeHtml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase()
    if (normalized.startsWith('#x')) {
      return decodeHtmlCodePoint(match, Number.parseInt(normalized.slice(2), 16))
    }
    if (normalized.startsWith('#')) {
      return decodeHtmlCodePoint(match, Number.parseInt(normalized.slice(1), 10))
    }

    return NAMED_HTML_ENTITIES[normalized] ?? match
  })
}

function decodeHtmlCodePoint(fallback: string, codePoint: number): string {
  if (!Number.isFinite(codePoint)) return fallback

  try {
    return String.fromCodePoint(codePoint)
  } catch {
    return fallback
  }
}

function mergeAdjacentText(segments: ReadingSegment[]): ReadingSegment[] {
  const merged: ReadingSegment[] = []

  for (const segment of segments) {
    const last = merged[merged.length - 1]
    if (segment.kind === 'text' && last?.kind === 'text') {
      last.text += segment.text
    } else {
      merged.push(segment)
    }
  }

  return merged
}