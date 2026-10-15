/**
 * Pure helpers for reading progress and "resume where you left off".
 * Everything here is DOM-free: callers pass plain numbers in document
 * coordinates, which keeps the logic unit-testable.
 */

export const READING_STORAGE_KEY = 'pb:reading-position:v1'
export const READING_MAX_ENTRIES = 50
export const READING_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
/** Don't remember positions in the first few percent of an article. */
export const READING_MIN_PROGRESS = 0.03
/** Tolerance (px) when deciding the reader has reached the end of the article. */
export const READING_END_TOLERANCE = 8

export interface ReadingAnchor {
  /** Index of the top-level block the last-seen line falls in. */
  blockIndex: number
  /** 0-1 position within that block. */
  offset: number
}

export interface ReadingEntry extends ReadingAnchor {
  /** 0-1 article progress at the last-seen line (bottom edge of the viewport). */
  furthest: number
  /** The post's `updated_at` when saved; a different value invalidates the entry. */
  postUpdatedAt: string
  savedAt: number
}

export type ReadingStore = Record<string, ReadingEntry>

export interface BlockRect {
  /** Document-coordinate top. */
  top: number
  height: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * Progress bar value: 0 when the article top reaches the viewport top, 1 when
 * the article bottom reaches the viewport bottom. Articles shorter than the
 * viewport are fully visible, so they count as 1.
 */
export function computeReadingProgress(input: {
  scrollY: number
  viewportHeight: number
  contentTop: number
  contentHeight: number
}): number {
  const { scrollY, viewportHeight, contentTop, contentHeight } = input
  if (contentHeight <= 0 || viewportHeight <= 0) {
    return 0
  }

  const scrollable = contentHeight - viewportHeight
  if (scrollable <= 0) {
    return scrollY + viewportHeight >= contentTop + contentHeight ? 1 : 0
  }

  return clamp01((scrollY - contentTop) / scrollable)
}

/** Article progress at a given document Y (the last-seen line). */
export function computeFurthest(y: number, contentTop: number, contentHeight: number): number {
  if (contentHeight <= 0) {
    return 0
  }
  return clamp01((y - contentTop) / contentHeight)
}

export function hasReachedEnd(viewportBottom: number, contentTop: number, contentHeight: number): boolean {
  return contentHeight > 0 && viewportBottom >= contentTop + contentHeight - READING_END_TOLERANCE
}

/**
 * Maps a document Y to a (block index, offset) anchor, or null if above all
 * blocks. Zero-height blocks (e.g. async blocks that haven't rendered yet) keep
 * their index slot but are never chosen as the anchor.
 */
export function computeAnchor(blocks: BlockRect[], y: number): ReadingAnchor | null {
  let index = -1
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    if (block.top > y) {
      break
    }
    if (block.height > 0) {
      index = i
    }
  }

  if (index < 0) {
    return null
  }

  const block = blocks[index]!
  const offset = block.height > 0 ? clamp01((y - block.top) / block.height) : 0
  return { blockIndex: index, offset }
}

/** Inverse of `computeAnchor`; null when the block no longer exists. */
export function resolveAnchor(blocks: BlockRect[], anchor: ReadingAnchor): number | null {
  const block = blocks[anchor.blockIndex]
  if (!block) {
    return null
  }
  return block.top + block.height * clamp01(anchor.offset)
}

export type ResumeDecision = 'none' | 'finished' | 'prompt'

/**
 * - `none`     – don't prompt (URL hash present, or the saved line is already on screen)
 * - `finished` – saved line is in the article's last viewport: treat as read, start over
 * - `prompt`   – ask the reader whether to jump back
 */
export function decideResume(input: {
  savedY: number
  viewportTop: number
  viewportHeight: number
  articleBottom: number
  hasHash: boolean
}): ResumeDecision {
  const { savedY, viewportTop, viewportHeight, articleBottom, hasHash } = input
  if (hasHash) {
    return 'none'
  }
  if (savedY <= viewportTop + viewportHeight) {
    return 'none'
  }
  if (savedY >= articleBottom - viewportHeight) {
    return 'finished'
  }
  return 'prompt'
}

function isEntry(value: unknown): value is ReadingEntry {
  if (!value || typeof value !== 'object') {
    return false
  }
  const entry = value as Record<string, unknown>
  return Number.isInteger(entry.blockIndex) && (entry.blockIndex as number) >= 0
    && typeof entry.offset === 'number' && Number.isFinite(entry.offset)
    && typeof entry.furthest === 'number' && Number.isFinite(entry.furthest)
    && typeof entry.postUpdatedAt === 'string'
    && typeof entry.savedAt === 'number' && Number.isFinite(entry.savedAt)
}

/** Parses the stored JSON, dropping anything malformed. Never throws. */
export function parseReadingStore(raw: string | null | undefined): ReadingStore {
  if (!raw) {
    return {}
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const store: ReadingStore = {}
    for (const [slug, value] of Object.entries(parsed)) {
      if (isEntry(value)) {
        store[slug] = value
      }
    }
    return store
  } catch {
    return {}
  }
}

/** Drops expired entries and keeps only the most recent `READING_MAX_ENTRIES`. */
export function pruneReadingStore(store: ReadingStore, now: number): ReadingStore {
  const fresh = Object.entries(store)
    .filter(([, entry]) => now - entry.savedAt <= READING_MAX_AGE_MS)
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, READING_MAX_ENTRIES)

  return Object.fromEntries(fresh)
}

/** An entry is only usable if the post hasn't been edited since it was saved. */
export function isEntryCurrent(entry: ReadingEntry | undefined, postUpdatedAt: string): entry is ReadingEntry {
  return Boolean(entry) && entry!.postUpdatedAt === postUpdatedAt
}

/**
 * Whether a new reading position should replace the stored one. Positions only
 * move forward, so glancing back at the top of a post never loses progress.
 */
export function shouldReplaceEntry(existing: ReadingEntry | undefined, next: ReadingEntry): boolean {
  if (next.furthest < READING_MIN_PROGRESS) {
    return false
  }
  if (!existing || existing.postUpdatedAt !== next.postUpdatedAt) {
    return true
  }
  return next.furthest >= existing.furthest
}
