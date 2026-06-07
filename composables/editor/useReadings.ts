import type { AnnotLang } from '~/extensions/rubyUnit'

export type ReadingSegment =
  | { kind: 'ruby', base: string, reading: string }
  | { kind: 'text', text: string }

interface ReadingEngine {
  annotate: (text: string) => Promise<ReadingSegment[]>
}

const HAN_REGEX = /\p{Script=Han}/u

const engineCache = new Map<AnnotLang, Promise<ReadingEngine>>()

let kuroshiroInstance: unknown = null
let kuroshiroInitPromise: Promise<unknown> | null = null

/**
 * Lazy-load + cache the per-language reading engine.
 * Each engine provides a uniform `annotate(text) => ReadingSegment[]`.
 */
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
    default: throw new Error(`Unsupported annotation language: ${lang}`)
  }
}

async function createMandarinEngine(): Promise<ReadingEngine> {
  const { pinyin } = await import('pinyin-pro')

  return {
    annotate(text: string) {
      return Promise.resolve(annotatePerCharacter(text, (chars) => {
        // pinyin-pro returns one entry per Han character when given a joined string.
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
  const getJyutping = (mod as unknown as { getJyutping?: (input: string) => Array<[string, string | null]> }).getJyutping
  if (typeof getJyutping !== 'function') {
    throw new Error('to-jyutping does not export getJyutping')
  }

  return {
    annotate(text: string) {
      return Promise.resolve(annotatePerCharacter(text, (chars) => {
        const result = getJyutping(chars.join(''))
        return chars.map((_, index) => {
          const entry = result[index]
          if (!entry) return ''
          const reading = entry[1]
          return typeof reading === 'string' ? reading : ''
        })
      }))
    }
  }
}

async function createJapaneseEngine(): Promise<ReadingEngine> {
  const kuroshiro = await getKuroshiro()
  type KuroshiroLike = { convert: (text: string, opts: { mode: 'furigana', to: 'hiragana' }) => Promise<string> }
  const instance = kuroshiro as KuroshiroLike

  return {
    async annotate(text: string) {
      if (!text) return []
      const html = await instance.convert(text, { mode: 'furigana', to: 'hiragana' })
      return parseFuriganaHtml(html)
    }
  }
}

async function getKuroshiro(): Promise<unknown> {
  if (kuroshiroInstance) return kuroshiroInstance
  if (kuroshiroInitPromise) return kuroshiroInitPromise

  kuroshiroInitPromise = (async () => {
    const KuroshiroMod = await import('kuroshiro')
    const AnalyzerMod = await import('kuroshiro-analyzer-kuromoji')

    const Kuroshiro = (KuroshiroMod as { default?: unknown }).default ?? KuroshiroMod
    const KuromojiAnalyzer = (AnalyzerMod as { default?: unknown }).default ?? AnalyzerMod

    const KuroshiroCtor = Kuroshiro as new () => { init: (analyzer: unknown) => Promise<void> }
    const AnalyzerCtor = KuromojiAnalyzer as new (opts?: { dictPath?: string }) => unknown

    const instance = new KuroshiroCtor()
    const analyzer = new AnalyzerCtor({ dictPath: '/dict/' })
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

/**
 * For per-character languages (cmn/yue): walk the string, group consecutive Han
 * characters, request readings in batch, then emit ruby + text segments.
 */
function annotatePerCharacter(text: string, getReadings: (chars: string[]) => string[]): ReadingSegment[] {
  if (!text) return []

  const chars = Array.from(text) // Array.from handles surrogate pairs
  const segments: ReadingSegment[] = []
  let textRun = ''

  // Collect Han chars that need lookup, then map them back to positions.
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

  if (textRun) {
    segments.push({ kind: 'text', text: textRun })
  }

  return segments
}

/**
 * Kuroshiro furigana HTML looks like:
 *   私<ruby>食<rp>(</rp><rt>た</rt><rp>)</rp></ruby>べる
 * Walk the DOM, collect ruby base/reading pairs, keep intervening text plain.
 */
function parseFuriganaHtml(html: string): ReadingSegment[] {
  if (!html) return []

  const container = typeof document !== 'undefined'
    ? document.createElement('div')
    : null

  if (!container) {
    // SSR fallback — extremely unlikely to be hit because annotate is called from the editor.
    return [{ kind: 'text', text: stripHtml(html) }]
  }

  container.innerHTML = html
  const segments: ReadingSegment[] = []

  container.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text) segments.push({ kind: 'text', text })
      return
    }

    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'ruby') {
      const ruby = node as HTMLElement
      const rt = ruby.querySelector('rt')
      const reading = rt?.textContent ?? ''
      // Remove rt/rp from a clone to extract the base text.
      const clone = ruby.cloneNode(true) as HTMLElement
      clone.querySelectorAll('rt, rp').forEach((n) => n.remove())
      const base = clone.textContent ?? ''
      if (base) {
        segments.push({ kind: 'ruby', base, reading })
      }
      return
    }

    // Any other element (unexpected) — flatten to text.
    const text = (node as HTMLElement).textContent ?? ''
    if (text) segments.push({ kind: 'text', text })
  })

  return mergeAdjacentText(segments)
}

function mergeAdjacentText(segments: ReadingSegment[]): ReadingSegment[] {
  const merged: ReadingSegment[] = []
  for (const segment of segments) {
    const last = merged[merged.length - 1]
    if (segment.kind === 'text' && last && last.kind === 'text') {
      last.text += segment.text
    } else {
      merged.push(segment)
    }
  }
  return merged
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

export function useReadings() {
  async function annotate(text: string, lang: AnnotLang): Promise<ReadingSegment[]> {
    if (!text) return []
    const engine = await getEngine(lang)
    return engine.annotate(text)
  }

  return { annotate }
}
