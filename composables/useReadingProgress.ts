import { computeReadingProgress } from '~/utils/readingPosition'

/**
 * Tracks how far through an article the reader has scrolled (0-1).
 * Client only; on the server (and when `enabled` is false) it stays at 0.
 */
export function useReadingProgress(contentEl: Ref<HTMLElement | null>, enabled: Ref<boolean>) {
  const progress = ref(0)
  let frame = 0
  let resizeObserver: ResizeObserver | null = null

  function update() {
    frame = 0
    const el = contentEl.value
    if (!el) {
      progress.value = 0
      return
    }

    const rect = el.getBoundingClientRect()
    progress.value = computeReadingProgress({
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
      contentTop: rect.top + window.scrollY,
      contentHeight: rect.height
    })
  }

  function schedule() {
    if (!frame) {
      frame = window.requestAnimationFrame(update)
    }
  }

  onMounted(() => {
    if (!enabled.value) {
      return
    }

    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    if (contentEl.value && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(schedule)
      resizeObserver.observe(contentEl.value)
    }
    update()
  })

  onBeforeUnmount(() => {
    if (!import.meta.client) {
      return
    }
    window.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    resizeObserver?.disconnect()
    if (frame) {
      window.cancelAnimationFrame(frame)
    }
  })

  return { progress }
}
