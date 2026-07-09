export type PostViewMode = 'grid' | 'list'

const STORAGE_KEY = 'pb-post-view-mode'
const MAX_GRID_COLUMNS = 4
const MOBILE_QUERY = '(max-width: 767px)'

let listenersAttached = false

function normalizeViewMode(value: unknown): PostViewMode | null {
  return value === 'grid' || value === 'list' ? value : null
}

function columnsForWidth(width: number): number {
  if (width >= 1680) return 4
  if (width >= 1280) return 3
  if (width >= 768) return 2
  if (width >= 640) return 2
  return 1
}

/**
 * Shared public post-list view state (grid vs list) plus the responsive column
 * count used to keep paging at a fixed number of rows. State is shared across
 * the header toggle and every listing page via `useState`, persisted to
 * `localStorage`, and synced to the viewport with `matchMedia`.
 */
export function usePostViewMode() {
  const { t } = useI18n()

  const viewMode = useState<PostViewMode>('pb-post-view-mode', () => 'grid')
  const gridColumns = useState<number>('pb-post-grid-columns', () => MAX_GRID_COLUMNS)
  const isMobileViewport = useState<boolean>('pb-post-mobile', () => false)

  const isListView = computed(() => viewMode.value === 'list')
  // Mirror the dark-mode button: the icon shows the mode you will switch to.
  const toggleIcon = computed(() => isListView.value ? 'i-lucide-layout-grid' : 'i-lucide-list')
  const toggleLabel = computed(() => isListView.value ? t('public.home.gridView') : t('public.home.listView'))

  function setViewMode(next: PostViewMode) {
    if (next === viewMode.value) return
    viewMode.value = next
    writeStored(next)
  }

  function toggleViewMode() {
    setViewMode(isListView.value ? 'grid' : 'list')
  }

  function writeStored(mode: PostViewMode) {
    if (!import.meta.client) return
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {}
  }

  function readStored(): PostViewMode | null {
    if (!import.meta.client) return null
    try {
      return normalizeViewMode(localStorage.getItem(STORAGE_KEY))
    } catch {
      return null
    }
  }

  function syncViewport() {
    if (!import.meta.client) return
    const width = window.innerWidth
    isMobileViewport.value = window.matchMedia(MOBILE_QUERY).matches
    gridColumns.value = Math.min(MAX_GRID_COLUMNS, columnsForWidth(width))
  }

  onMounted(() => {
    const stored = readStored()
    if (stored) {
      viewMode.value = stored
    }

    syncViewport()

    if (!listenersAttached) {
      listenersAttached = true
      window.addEventListener('resize', syncViewport, { passive: true })
    }
  })

  return {
    viewMode,
    isListView,
    isMobileViewport,
    gridColumns,
    toggleIcon,
    toggleLabel,
    setViewMode,
    toggleViewMode
  }
}
