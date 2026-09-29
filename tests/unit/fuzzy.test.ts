import { describe, expect, it } from 'vitest'
import {
  FTS_MAX_TOKEN_LENGTH,
  buildFuzzyVariants,
  clampFtsNeedle,
  createPhraseMatcher,
  damerauLevenshtein,
  extractVocabularyWords,
  findFuzzyCandidates,
  fuzzyLookupWords,
  fuzzyPenalty,
  maxEditsForLength,
  rankFuzzyCandidates
} from '../../server/utils/fuzzy'

describe('maxEditsForLength', () => {
  it('scales the allowed edits with the word length', () => {
    expect([1, 2, 3].map(maxEditsForLength)).toEqual([0, 0, 0])
    expect([4, 5, 6, 7].map(maxEditsForLength)).toEqual([1, 1, 1, 1])
    expect([8, 12, 20].map(maxEditsForLength)).toEqual([2, 2, 2])
  })
})

describe('damerauLevenshtein', () => {
  it('counts substitutions, insertions, deletions and adjacent swaps as one edit', () => {
    expect(damerauLevenshtein('gibhub', 'github')).toBe(1) // substitution
    expect(damerauLevenshtein('gihub', 'github')).toBe(1) // insertion
    expect(damerauLevenshtein('gitthub', 'github')).toBe(1) // deletion
    expect(damerauLevenshtein('githbu', 'github')).toBe(1) // adjacent swap
    expect(damerauLevenshtein('gibhbu', 'github')).toBe(2)
    expect(damerauLevenshtein('kitten', 'sitting')).toBe(3)
    expect(damerauLevenshtein('', 'abc')).toBe(3)
    expect(damerauLevenshtein('same', 'same')).toBe(0)
  })

  it('stops early once the distance exceeds the limit', () => {
    expect(damerauLevenshtein('abcdef', 'uvwxyz', 1)).toBe(2)
    expect(damerauLevenshtein('short', 'much longer word', 2)).toBe(3)
  })

  it('works on code points, not UTF-16 units', () => {
    expect(damerauLevenshtein('café', 'cafe')).toBe(1)
  })
})

describe('extractVocabularyWords', () => {
  it('keeps distinct lowercased Latin/Greek/Cyrillic words of 4-30 letters', () => {
    const words = extractVocabularyWords('GitHub github Vue3 is 国际化 great, привет мир; the café')
    expect(words).toEqual(['github', 'great', 'привет', 'café'])
  })

  it('never includes CJK or Hangul text', () => {
    expect(extractVocabularyWords('日本語のテキスト 한국어텍스트 中文内容')).toEqual([])
  })
})

describe('findFuzzyCandidates', () => {
  const vocabulary = new Map([
    ['github', 5],
    ['gitlab', 2],
    ['gist', 1],
    ['hubble', 1],
    ['kubernetes', 3]
  ])

  it('finds close words that share the first letter', () => {
    expect(findFuzzyCandidates('gibhub', vocabulary)).toEqual({
      known: false,
      candidates: [{ term: 'github', distance: 1, df: 5 }]
    })
    expect(findFuzzyCandidates('kubernets', vocabulary).candidates.map((c) => c.term)).toEqual(['kubernetes'])
  })

  it('does not fuzz known words or prefixes of known words', () => {
    expect(findFuzzyCandidates('github', vocabulary)).toEqual({ known: true, candidates: [] })
    expect(findFuzzyCandidates('gith', vocabulary)).toEqual({ known: true, candidates: [] })
  })

  it('requires the same first letter', () => {
    expect(findFuzzyCandidates('fithub', vocabulary).candidates).toEqual([])
  })

  it('ignores words that are too short to fuzz', () => {
    expect(findFuzzyCandidates('gis', vocabulary)).toEqual({ known: false, candidates: [] })
  })
})

describe('rankFuzzyCandidates', () => {
  it('orders by distance, then popularity, and caps the list', () => {
    const ranked = rankFuzzyCandidates([
      { term: 'b', distance: 2, df: 9 },
      { term: 'a', distance: 1, df: 1 },
      { term: 'c', distance: 1, df: 5 },
      { term: 'd', distance: 1, df: 5 },
      { term: 'exact', distance: 0, df: 100 }
    ])
    expect(ranked.map((c) => c.term)).toEqual(['c', 'd', 'a'])
  })
})

describe('buildFuzzyVariants', () => {
  it('rewrites misspelled words and keeps the rest of the keyword', () => {
    const variants = buildFuzzyVariants('Gibhub actions', new Map([
      ['gibhub', [{ term: 'github', distance: 1, df: 3 }]]
    ]))
    expect(variants).toEqual([{ text: 'github actions', distance: 1 }])
  })

  it('combines candidates of several words ordered by total distance', () => {
    const variants = buildFuzzyVariants('gitlub runers', new Map([
      ['gitlub', [{ term: 'gitlab', distance: 1, df: 3 }, { term: 'github', distance: 1, df: 1 }]],
      ['runers', [{ term: 'runners', distance: 1, df: 2 }]]
    ]))
    expect(variants.map((v) => v.text)).toEqual(['gitlab runners', 'github runners'])
    expect(variants.every((v) => v.distance === 2)).toBe(true)
  })

  it('returns nothing without candidates', () => {
    expect(buildFuzzyVariants('github', new Map())).toEqual([])
  })
})

describe('fuzzyLookupWords', () => {
  it('only returns words that can be fuzzed', () => {
    expect(fuzzyLookupWords('the gibhub 国际化 CI pipelnes')).toEqual(['gibhub', 'pipelnes'])
  })
})

describe('clampFtsNeedle', () => {
  it('truncates tokens longer than the analyzer ngram max', () => {
    expect(clampFtsNeedle('internationalization tips')).toBe(`${'internationalization'.slice(0, FTS_MAX_TOKEN_LENGTH)} tips`)
    expect(clampFtsNeedle('short words stay')).toBe('short words stay')
  })
})

describe('createPhraseMatcher', () => {
  it('requires the words in order, separated only by spaces or punctuation', () => {
    const matches = createPhraseMatcher('github actions')
    expect(matches('Using GitHub Actions today')).toBe(true)
    expect(matches('GitHub, actions!')).toBe(true)
    expect(matches('actions on github')).toBe(false)
    expect(matches('github and actions')).toBe(false)
  })

  it('accepts everything for single words', () => {
    expect(createPhraseMatcher('github')('anything')).toBe(true)
  })

  it('escapes regex characters', () => {
    expect(createPhraseMatcher('c++ (lang)')('learn C++ (lang) now')).toBe(true)
  })
})

describe('fuzzyPenalty', () => {
  it('ranks closer corrections higher', () => {
    expect(fuzzyPenalty(0)).toBe(1)
    expect(fuzzyPenalty(1)).toBeGreaterThan(fuzzyPenalty(2))
  })
})
