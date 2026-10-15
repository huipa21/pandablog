import {
  READING_STORAGE_KEY,
  computeAnchor,
  computeFurthest,
  decideResume,
  hasReachedEnd,
  isEntryCurrent,
  parseReadingStore,
  pruneReadingStore,
  resolveAnchor,
  shouldReplaceEntry,
  type BlockRect,
  type ReadingEntry,
  type ReadingStore
} from '~/utils/readingPosition'

const SAVE_INTERVAL_MS = 1000
const PROMPT_TIMEOUT_MS = 10_000
const SETTLE_TIMEOUT_MS = 1500
/** Scrolling this far while the prompt is open counts as "start from the top". */
const SCROLL_DISMISS_PX = 80
/** After resuming, the saved line is placed this far down the viewport. */
const RESUME_VIEWPORT_RATIO = 0.75

interface Options {
  slug: () => string
  updatedAt: () => string
  /** Element wrapping the rendered article body (`.pb-prose` plus footnotes). */
  contentEl: Ref<HTMLElement | null>
  enabled: Ref<boolean>
}

/**
 * Remembers how far a reader got in a post (localStorage only) and offers to
 * jump back on the next visit. See `utils/readingPosition.ts` for the rules.
 */
export function useReadingPosition(options: Options) {
  const route = useRoute()
  const promptVisible = ref(false)

  let activeSlug = ''
  let activeUpdatedAt = ''
  let pending: ReadingEntry | null = null
  let tracking = false
  let finished = false
  let maxBottom = 0
  let promptStartScrollY = 0
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let promptTimer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let listening = false

  function readStore(): ReadingStore {
    try {
      return parseReadingStore(window.localStorage.getItem(READING_STORAGE_KEY))
    } catch {
      return {}
    }
  }

  function writeStore(store: ReadingStore) {
    try {
      window.localStorage.setItem(READING_STORAGE_KEY, JSON.stringify(pruneReadingStore(store, Date.now())))
    } catch {
      // Storage unavailable or full; resume just won't work.
    }
  }

  function removeEntry() {
    const store = readStore()
    if (activeSlug in store) {
      const { [activeSlug]: _removed, ...rest } = store
      writeStore(rest)
    }
  }

  function contentRect() {
    const rect = options.contentEl.value?.getBoundingClientRect()
    return rect
      ? { top: rect.top + window.scrollY, height: rect.height }
      : { top: 0, height: 0 }
  }

  /**
   * One slot per top-level block. Blocks that haven't rendered yet (async
   * components render a comment) get a zero-height slot so indices stay stable.
   */
  function blockRects(): BlockRect[] {
    const root = options.contentEl.value?.querySelector('.pb-prose')
    if (!root) {
      return []
    }

    const rects: BlockRect[] = []
    let previousBottom = root.getBoundingClientRect().top + window.scrollY
    for (const node of Array.from(root.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const rect = (node as Element).getBoundingClientRect()
        const top = rect.top + window.scrollY
        rects.push({ top, height: rect.height })
        previousBottom = top + rect.height
      } else if (node.nodeType === Node.COMMENT_NODE) {
        rects.push({ top: previousBottom, height: 0 })
      }
    }
    return rects
  }

  // --- saving ---------------------------------------------------------------

  function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = undefined
    }
    if (!tracking || finished || !activeSlug) {
      return
    }

    const anchor = computeAnchor(blockRects(), maxBottom)
    if (!anchor) {
      return
    }

    const { top, height } = contentRect()
    const next: ReadingEntry = {
      ...anchor,
      furthest: computeFurthest(maxBottom, top, height),
      postUpdatedAt: activeUpdatedAt,
      savedAt: Date.now()
    }

    const store = readStore()
    if (shouldReplaceEntry(store[activeSlug], next)) {
      store[activeSlug] = next
      writeStore(store)
    }
  }

  function scheduleSave() {
    if (!saveTimer) {
      saveTimer = setTimeout(flush, SAVE_INTERVAL_MS)
    }
  }

  function observe() {
    if (!tracking || finished) {
      return
    }

    const { top, height } = contentRect()
    const bottom = window.scrollY + window.innerHeight

    // Reaching the end counts as finished: forget the position for this visit.
    if (hasReachedEnd(bottom, top, height)) {
      finished = true
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = undefined
      }
      removeEntry()
      return
    }

    maxBottom = Math.max(maxBottom, bottom)
    scheduleSave()
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      flush()
    }
  }

  function startTracking() {
    if (tracking) {
      return
    }
    tracking = true
    finished = false
    maxBottom = 0
    window.addEventListener('scroll', observe, { passive: true })
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibilityChange)
    observe()
  }

  function stopTracking() {
    tracking = false
    window.removeEventListener('scroll', observe)
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  // --- prompt ---------------------------------------------------------------

  function onPointerDown(event: PointerEvent) {
    const target = event.target as Element | null
    if (target?.closest?.('[data-resume-prompt]')) {
      return
    }
    closePrompt(false)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closePrompt(false)
    }
  }

  function onPromptScroll() {
    if (Math.abs(window.scrollY - promptStartScrollY) > SCROLL_DISMISS_PX) {
      closePrompt(false)
    }
  }

  function showPrompt(entry: ReadingEntry) {
    pending = entry
    promptVisible.value = true
    promptStartScrollY = window.scrollY
    listening = true
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onPromptScroll, { passive: true })
    promptTimer = setTimeout(() => closePrompt(false), PROMPT_TIMEOUT_MS)
  }

  function hidePrompt() {
    promptVisible.value = false
    if (promptTimer) {
      clearTimeout(promptTimer)
      promptTimer = undefined
    }
    if (listening) {
      listening = false
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onPromptScroll)
    }
  }

  /**
   * Closes the prompt and starts from the top. Only the explicit close button
   * forgets the saved position; clicking elsewhere, Esc, scrolling, or the
   * timeout keep it so the offer returns next visit.
   */
  function closePrompt(forget: boolean) {
    if (!promptVisible.value) {
      return
    }
    hidePrompt()
    pending = null
    if (forget) {
      removeEntry()
    }
    startTracking()
  }

  function resume() {
    if (!promptVisible.value || !pending) {
      return
    }

    const y = resolveAnchor(blockRects(), pending)
    hidePrompt()
    pending = null
    startTracking()

    if (y !== null) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      window.scrollTo({
        top: Math.max(0, y - window.innerHeight * RESUME_VIEWPORT_RATIO),
        behavior: reduceMotion ? 'auto' : 'smooth'
      })
    }
  }

  // --- lifecycle ------------------------------------------------------------

  /** Resolves once images/layout have had a chance to settle (or after a timeout). */
  function settled() {
    return new Promise<void>((resolve) => {
      const done = () => window.requestAnimationFrame(() => resolve())
      if (document.readyState === 'complete') {
        done()
        return
      }

      const onLoad = () => {
        clearTimeout(timer)
        done()
      }
      const timer = setTimeout(() => {
        window.removeEventListener('load', onLoad)
        done()
      }, SETTLE_TIMEOUT_MS)
      window.addEventListener('load', onLoad, { once: true })
    })
  }

  async function init() {
    const current = ++generation
    activeSlug = options.slug()
    activeUpdatedAt = options.updatedAt()

    await nextTick()
    await settled()
    if (current !== generation || !options.contentEl.value) {
      return
    }

    const store = readStore()
    let entry = store[activeSlug]
    if (entry && !isEntryCurrent(entry, activeUpdatedAt)) {
      removeEntry()
      entry = undefined
    }

    if (entry) {
      const savedY = resolveAnchor(blockRects(), entry)
      if (savedY === null) {
        removeEntry()
      } else {
        const { top, height } = contentRect()
        const decision = decideResume({
          savedY,
          viewportTop: window.scrollY,
          viewportHeight: window.innerHeight,
          articleBottom: top + height,
          hasHash: Boolean(route.hash)
        })

        if (decision === 'finished') {
          removeEntry()
        } else if (decision === 'prompt') {
          showPrompt(entry)
          return
        }
      }
    }

    startTracking()
  }

  function teardown() {
    generation++
    flush()
    hidePrompt()
    stopTracking()
    pending = null
  }

  onMounted(() => {
    if (options.enabled.value) {
      void init()
    }
  })

  watch(options.slug, () => {
    if (!import.meta.client || !options.enabled.value) {
      return
    }
    teardown()
    void init()
  })

  onBeforeUnmount(() => {
    if (import.meta.client) {
      teardown()
    }
  })

  return {
    promptVisible,
    resume,
    dismiss: () => closePrompt(true)
  }
}
