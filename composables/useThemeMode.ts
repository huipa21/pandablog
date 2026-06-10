import { normalizeThemeMode, type ThemeMode } from '~/utils/themeMode'

interface UseThemeModeOptions {
  storageKey?: string
  initialMode?: () => unknown
  defaultMode?: ThemeMode | null
  persist?: (mode: ThemeMode) => Promise<void> | void
}

export function useThemeMode(options: UseThemeModeOptions = {}) {
  const { t } = useI18n()
  const currentMode = ref<ThemeMode | null>(resolveInitialMode())
  const saving = ref(false)
  const error = ref('')

  const colorMode = computed<ThemeMode>(() => currentMode.value ?? 'light')
  const isDark = computed(() => colorMode.value === 'dark')
  const toggleIcon = computed(() => isDark.value ? 'i-lucide-sun' : 'i-lucide-moon')
  const toggleLabel = computed(() => isDark.value ? t('public.theme.switchToLight') : t('public.theme.switchToDark'))

  useHead(() => ({
    htmlAttrs: currentMode.value ? { 'data-theme': currentMode.value } : {},
    meta: [
      { key: 'color-scheme', name: 'color-scheme', content: currentMode.value ?? 'light dark' }
    ]
  }))

  watch(
    () => normalizeThemeMode(options.initialMode?.()),
    (nextMode) => {
      if (nextMode && nextMode !== currentMode.value) {
        currentMode.value = nextMode
      }
    },
    { immediate: true }
  )

  watch(currentMode, (nextMode) => {
    if (nextMode) {
      applyThemeMode(nextMode)
    }
  }, { immediate: true })

  onMounted(() => {
    const mountedMode = readStoredMode() ?? currentMode.value ?? systemMode()
    currentMode.value = mountedMode
    applyThemeMode(mountedMode)
  })

  async function setThemeMode(nextMode: ThemeMode) {
    if (nextMode === currentMode.value) {
      return
    }

    const previousMode = currentMode.value
    currentMode.value = nextMode
    writeStoredMode(nextMode)

    if (!options.persist) {
      return
    }

    saving.value = true
    error.value = ''

    try {
      await options.persist(nextMode)
    } catch (err) {
      currentMode.value = previousMode ?? options.defaultMode ?? systemMode()
      error.value = err instanceof Error ? err.message : 'Could not save theme mode'
    } finally {
      saving.value = false
    }
  }

  function toggleThemeMode() {
    return setThemeMode(isDark.value ? 'light' : 'dark')
  }

  function resolveInitialMode() {
    return normalizeThemeMode(options.initialMode?.()) ?? options.defaultMode ?? null
  }

  function readStoredMode() {
    if (!import.meta.client || !options.storageKey) {
      return null
    }

    try {
      return normalizeThemeMode(localStorage.getItem(options.storageKey))
    } catch {
      return null
    }
  }

  function writeStoredMode(mode: ThemeMode) {
    if (!import.meta.client || !options.storageKey) {
      return
    }

    try {
      localStorage.setItem(options.storageKey, mode)
    } catch {}
  }

  function systemMode(): ThemeMode {
    if (!import.meta.client) {
      return options.defaultMode ?? 'light'
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  function applyThemeMode(mode: ThemeMode) {
    if (!import.meta.client) {
      return
    }

    document.documentElement.dataset.theme = mode
    document.documentElement.style.colorScheme = mode
  }

  return {
    colorMode,
    isDark,
    toggleIcon,
    toggleLabel,
    saving,
    error,
    setThemeMode,
    toggleThemeMode
  }
}