declare module 'kuroshiro' {
  interface ConvertOptions {
    mode?: 'normal' | 'spaced' | 'okurigana' | 'furigana'
    to?: 'hiragana' | 'katakana' | 'romaji'
    romajiSystem?: 'nippon' | 'passport' | 'hepburn'
    delimiter_start?: string
    delimiter_end?: string
  }

  interface Analyzer {
    init: () => Promise<void>
    parse: (text: string) => Promise<unknown[]>
  }

  class Kuroshiro {
    init(analyzer: Analyzer): Promise<void>
    convert(text: string, options?: ConvertOptions): Promise<string>
  }

  export default Kuroshiro
}

declare module 'kuroshiro-analyzer-kuromoji' {
  interface AnalyzerOptions {
    dictPath?: string
  }

  class KuromojiAnalyzer {
    constructor(options?: AnalyzerOptions)
    init(): Promise<void>
    parse(text: string): Promise<unknown[]>
  }

  export default KuromojiAnalyzer
}
