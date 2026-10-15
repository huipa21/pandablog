import {
  DEFAULT_READER_PREFS,
  READER_FONT_SIZES,
  READER_PREFS_STORAGE_KEY,
  isDefaultReaderPrefs,
  normalizeReaderPrefs,
  parseReaderPrefs,
  stepOption,
  type ReaderAppearance,
  type ReaderFontFamily,
  type ReaderFontSize,
  type ReaderLineWidth,
  type ReaderPrefs
} from '~/utils/readerPrefs'

/**
 * Local, visitor-only "Reader mode" preferences for the post page: font size,
 * serif/sans family, light/sepia/dark appearance and line width. Stored in
 * `localStorage` only (no account/site setting), shared across the settings
 * popover and the post article via `useState` so every consumer stays in sync.
 */
export function useReaderPrefs() {
  const prefs = useState<ReaderPrefs>('pb-reader-prefs', () => ({ ...DEFAULT_READER_PREFS }))
  const isCustomized = computed(() => !isDefaultReaderPrefs(prefs.value))

  function persist() {
    if (!import.meta.client) return
    try {
      localStorage.setItem(READER_PREFS_STORAGE_KEY, JSON.stringify(prefs.value))
    } catch {}
  }

  function update(patch: Partial<ReaderPrefs>) {
    prefs.value = normalizeReaderPrefs({ ...prefs.value, ...patch })
    persist()
  }

  function setFontSize(value: ReaderFontSize) {
    update({ fontSize: value })
  }

  function setFontFamily(value: ReaderFontFamily) {
    update({ fontFamily: value })
  }

  function setAppearance(value: ReaderAppearance) {
    update({ appearance: value })
  }

  function setLineWidth(value: ReaderLineWidth) {
    update({ lineWidth: value })
  }

  function stepFontSize(delta: 1 | -1) {
    setFontSize(stepOption(READER_FONT_SIZES, prefs.value.fontSize, delta))
  }

  function reset() {
    prefs.value = { ...DEFAULT_READER_PREFS }
    persist()
  }

  onMounted(() => {
    if (!import.meta.client) return
    try {
      prefs.value = parseReaderPrefs(localStorage.getItem(READER_PREFS_STORAGE_KEY))
    } catch {}
  })

  return {
    prefs,
    isCustomized,
    setFontSize,
    setFontFamily,
    setAppearance,
    setLineWidth,
    stepFontSize,
    reset
  }
}
