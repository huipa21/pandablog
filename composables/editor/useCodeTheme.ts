import { computed, ref, onMounted, onBeforeUnmount } from 'vue'

/** Observe site mode without changing it or persisting post decoration. */
export function useCodeTheme() {
  const dark = ref(false)
  let observer: MutationObserver | undefined
  let query: MediaQueryList | undefined
  function update() {
    const mode = document.documentElement.dataset.theme
    dark.value = mode === 'dark' || (!mode && Boolean(query?.matches))
  }
  onMounted(() => {
    query = window.matchMedia('(prefers-color-scheme: dark)')
    query.addEventListener('change', update)
    observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    update()
  })
  onBeforeUnmount(() => { observer?.disconnect(); query?.removeEventListener('change', update) })
  return computed(() => dark.value ? 'github-dark' : 'github-light')
}
