<template>
  <Teleport to="body">
    <Transition name="media-picker">
      <div v-if="open" class="pointer-events-auto fixed inset-0 z-[1200] flex items-center justify-center p-2 sm:p-4" @wheel.self.prevent @touchmove.self.prevent>
        <button type="button" class="absolute inset-0 bg-black/50" :aria-label="t('admin.common.close')" @wheel.prevent @touchmove.prevent @click="dismissible && close()" />
        <section class="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] shadow-[var(--pb-shadow-lg)] sm:max-h-[90vh]">
          <header class="flex items-center justify-between border-b border-[var(--pb-divider)] px-4 py-3">
            <div>
              <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.media.title') }}</h2>
              <p class="text-xs text-[var(--pb-text-subtle)]">{{ t('admin.media.selectedCount', { count: selected.length }) }}</p>
            </div>
            <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" @click="close" />
          </header>

          <div class="flex border-b border-[var(--pb-divider)]">
            <button type="button" class="picker-tab" :class="tab === 'browse' ? activeTabClass : inactiveTabClass" @click="tab = 'browse'">
              <UIcon name="i-lucide-images" class="size-4" />
              {{ t('admin.media.browse') }}
            </button>
            <button type="button" class="picker-tab" :class="tab === 'upload' ? activeTabClass : inactiveTabClass" @click="tab = 'upload'">
              <UIcon name="i-lucide-upload" class="size-4" />
              {{ t('admin.media.upload') }}
            </button>
            <button type="button" class="picker-tab" :class="tab === 'url' ? activeTabClass : inactiveTabClass" @click="tab = 'url'">
              <UIcon name="i-lucide-link" class="size-4" />
              {{ t('admin.media.fromUrl') }}
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-4">
            <div v-if="tab === 'upload'" class="w-full">
              <MediaUploader @upload-complete="handleUploadComplete" />
            </div>

            <div v-else-if="tab === 'url'" class="mx-auto flex w-full max-w-xl flex-col gap-3">
              <p class="text-sm text-[var(--pb-text-muted)]">
                {{ t('admin.media.directUrlHelp') }}
              </p>
              <UFormField :label="t('admin.media.imageUrl')" required>
                <UInput
                  v-model="urlInput"
                  placeholder="https://example.com/photo.jpg"
                  icon="i-lucide-link"
                  :disabled="urlImporting"
                  @keydown.enter.prevent="importFromUrlTab"
                />
              </UFormField>
              <UAlert v-if="urlError" color="error" icon="i-lucide-circle-alert" :title="urlError" />
              <div class="flex justify-end">
                <UButton
                  type="button"
                  icon="i-lucide-download"
                  :loading="urlImporting"
                  :disabled="!urlInput.trim() || urlImporting"
                  @click="importFromUrlTab"
                >
                  {{ t('admin.media.import') }}
                </UButton>
              </div>
            </div>

            <div v-else class="space-y-4">
              <MediaSearchBar v-model="filters" @search="refresh" />
              <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <USkeleton v-for="index in 10" :key="index" class="aspect-square rounded-lg" />
              </div>
              <div v-else-if="!files.length" class="rounded-[var(--pb-radius-card-inner)] border border-dashed border-[var(--pb-border-strong)] py-12 text-center text-sm text-[var(--pb-text-subtle)]">
                {{ t('admin.media.noFilesFound') }}
              </div>
              <MediaGrid
                v-else
                :files="files"
                :page="page"
                :pages="pages"
                :selected-hashes="selected.map((file) => file.hash)"
                @select="selectFile"
                @toggle-select="toggleSelection"
                @range-select="rangeSelection"
                @drag-select="dragSelect"
                @change-page="changePage"
              />
            </div>
          </div>

          <footer class="flex items-center justify-between gap-3 border-t border-[var(--pb-divider)] px-4 py-3">
            <div class="min-w-0 truncate text-sm text-[var(--pb-text-muted)]">{{ selectedNames }}</div>
            <div class="flex gap-2">
              <UButton type="button" color="neutral" variant="ghost" @click="close">{{ t('admin.media.cancel') }}</UButton>
              <UButton type="button" icon="i-lucide-check" :disabled="!selected.length" @click="confirmSelection">{{ t('admin.media.select') }}</UButton>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { MediaRecord } from '~/types/content'
import MediaGrid from '~/components/admin/media/MediaGrid.vue'
import MediaSearchBar from '~/components/admin/media/MediaSearchBar.vue'
import MediaUploader from '~/components/admin/media/MediaUploader.vue'

type ReturnValue = 'hash' | 'url'

interface PickerFilters {
  search: string
  type: string
  tag: string
  uploaded_from: string
  uploaded_to: string
  orphan: boolean
  search_regex: boolean
  case_insensitive: boolean
}

const props = withDefaults(defineProps<{
  open: boolean
  modelValue?: string | string[] | null
  multiple?: boolean
  returnValue?: ReturnValue
  typeFilter?: string
  dismissible?: boolean
}>(), {
  modelValue: null,
  multiple: false,
  returnValue: 'hash',
  typeFilter: 'all',
  dismissible: true
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:modelValue': [value: string | string[] | null]
  'select': [files: MediaRecord[]]
}>()

const { t } = useI18n()
const { listMedia, importFromUrl } = useMedia()
const tab = ref<'browse' | 'upload' | 'url'>('browse')
const files = ref<MediaRecord[]>([])
const selected = ref<MediaRecord[]>([])
const loading = ref(false)
const page = ref(1)
const pages = ref(1)
const lastSelectedHash = ref('')
const urlInput = ref('')
const urlImporting = ref(false)
const urlError = ref('')
const filters = ref<PickerFilters>({
  search: '',
  type: props.typeFilter,
  tag: '',
  uploaded_from: '',
  uploaded_to: '',
  orphan: false,
  search_regex: false,
  case_insensitive: true
})

const activeTabClass = 'border-[var(--pb-selected-border)] text-[var(--pb-link-hover)]'
const inactiveTabClass = 'border-transparent text-[var(--pb-text-subtle)] hover:text-[var(--pb-text)]'
const selectedNames = computed(() => selected.value.map((file) => file.original_name).join(', ') || t('admin.media.noFilesSelected'))
let previousBodyOverflow = ''

watch(() => props.open, (value) => {
  if (value) {
    lockBodyScroll()
    tab.value = 'browse'
    filters.value.type = props.typeFilter
    urlInput.value = ''
    urlError.value = ''
    urlImporting.value = false
    void refresh()
  } else {
    unlockBodyScroll()
  }
})

async function refresh() {
  loading.value = true
  try {
    const response = await listMedia({
      page: page.value,
      limit: 20,
      search: filters.value.search,
      search_regex: filters.value.search_regex,
      case_insensitive: filters.value.case_insensitive,
      type: filters.value.type as any,
      tag: filters.value.tag,
      uploaded_from: filters.value.uploaded_from,
      uploaded_to: filters.value.uploaded_to,
      orphan: filters.value.orphan
    })
    files.value = response.files
    pages.value = response.pages || 1
  } finally {
    loading.value = false
  }
}

function changePage(nextPage: number) {
  page.value = nextPage
  void refresh()
}

function selectFile(file: MediaRecord) {
  if (!props.multiple) {
    selected.value = [file]
    lastSelectedHash.value = file.hash
    return
  }

  toggleSelection(file)
}

function toggleSelection(file: MediaRecord) {
  const exists = selected.value.some((item) => item.hash === file.hash)
  selected.value = exists
    ? selected.value.filter((item) => item.hash !== file.hash)
    : [...selected.value, file]
  lastSelectedHash.value = file.hash
}

function rangeSelection(file: MediaRecord) {
  if (!props.multiple) {
    selectFile(file)
    return
  }

  const currentIndex = files.value.findIndex((item) => item.hash === file.hash)
  const lastIndex = files.value.findIndex((item) => item.hash === lastSelectedHash.value)
  if (currentIndex < 0 || lastIndex < 0) {
    toggleSelection(file)
    return
  }

  const [start, end] = currentIndex < lastIndex ? [currentIndex, lastIndex] : [lastIndex, currentIndex]
  const selectedByHash = new Map(selected.value.map((item) => [item.hash, item]))
  for (const item of files.value.slice(start, end + 1)) {
    selectedByHash.set(item.hash, item)
  }
  selected.value = Array.from(selectedByHash.values())
  lastSelectedHash.value = file.hash
}

function dragSelect(hash: string) {
  if (!props.multiple) return
  const file = files.value.find((item) => item.hash === hash)
  if (!file || selected.value.some((item) => item.hash === hash)) return
  selected.value = [...selected.value, file]
  lastSelectedHash.value = hash
}

function handleUploadComplete() {
  tab.value = 'browse'
  page.value = 1
  filters.value = {
    search: '',
    type: props.typeFilter,
    tag: '',
    uploaded_from: '',
    uploaded_to: '',
    orphan: false,
    search_regex: false,
    case_insensitive: true
  }
  void refresh()
}

async function importFromUrlTab() {
  const value = urlInput.value.trim()
  if (!value || urlImporting.value) return

  urlImporting.value = true
  urlError.value = ''
  try {
    const record = await importFromUrl(value)
    selected.value = [record]
    urlInput.value = ''
    confirmSelection()
  } catch (error: any) {
    urlError.value = error?.data?.message || error?.statusMessage || error?.message || t('admin.media.importUrlFailed')
  } finally {
    urlImporting.value = false
  }
}

function confirmSelection() {
  const values = selected.value.map((file) => props.returnValue === 'url' ? file.url : file.hash)
  emit('update:modelValue', props.multiple ? values : values[0] || null)
  emit('select', selected.value)
  close()
}

function close() {
  emit('update:open', false)
}

function lockBodyScroll() {
  if (!import.meta.client) return
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
}

function unlockBodyScroll() {
  if (!import.meta.client) return
  document.body.style.overflow = previousBodyOverflow
}

onBeforeUnmount(() => {
  if (props.open) {
    unlockBodyScroll()
  }
})
</script>

<style scoped>
.picker-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-bottom-width: 2px;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.media-picker-enter-active,
.media-picker-leave-active {
  transition: opacity 0.18s ease;
}

.media-picker-enter-from,
.media-picker-leave-to {
  opacity: 0;
}
</style>
