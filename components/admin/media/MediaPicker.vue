<template>
  <Teleport to="body">
    <Transition name="media-picker">
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button type="button" class="absolute inset-0 bg-black/50" aria-label="Close" @click="close" />
        <section class="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
          <header class="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <div>
              <h2 class="text-lg font-semibold text-stone-950">Media Library</h2>
              <p class="text-xs text-stone-500">{{ selected.length }} selected</p>
            </div>
            <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" @click="close" />
          </header>

          <div class="flex border-b border-stone-200">
            <button type="button" class="picker-tab" :class="tab === 'browse' ? activeTabClass : inactiveTabClass" @click="tab = 'browse'">
              <UIcon name="i-lucide-images" class="size-4" />
              Browse
            </button>
            <button type="button" class="picker-tab" :class="tab === 'upload' ? activeTabClass : inactiveTabClass" @click="tab = 'upload'">
              <UIcon name="i-lucide-upload" class="size-4" />
              Upload
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-4">
            <div v-if="tab === 'upload'" class="w-full">
              <MediaUploader @upload-complete="handleUploadComplete" />
            </div>

            <div v-else class="space-y-4">
              <MediaSearchBar v-model="filters" @search="refresh" />
              <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <USkeleton v-for="index in 10" :key="index" class="aspect-square rounded-lg" />
              </div>
              <div v-else-if="!files.length" class="rounded-lg border border-dashed border-stone-300 py-12 text-center text-sm text-stone-500">
                No files found
              </div>
              <MediaGrid
                v-else
                :files="files"
                :page="page"
                :pages="pages"
                :selected-hashes="selected.map((file) => file.hash)"
                @select="toggleSelection"
                @change-page="changePage"
              />
            </div>
          </div>

          <footer class="flex items-center justify-between gap-3 border-t border-stone-200 px-4 py-3">
            <div class="min-w-0 truncate text-sm text-stone-600">{{ selectedNames }}</div>
            <div class="flex gap-2">
              <UButton type="button" color="neutral" variant="ghost" @click="close">Cancel</UButton>
              <UButton type="button" icon="i-lucide-check" :disabled="!selected.length" @click="confirmSelection">Select</UButton>
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
}>(), {
  modelValue: null,
  multiple: false,
  returnValue: 'hash',
  typeFilter: 'all'
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:modelValue': [value: string | string[] | null]
  'select': [files: MediaRecord[]]
}>()

const { listMedia } = useMedia()
const tab = ref<'browse' | 'upload'>('browse')
const files = ref<MediaRecord[]>([])
const selected = ref<MediaRecord[]>([])
const loading = ref(false)
const page = ref(1)
const pages = ref(1)
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

const activeTabClass = 'border-teal-600 text-teal-700'
const inactiveTabClass = 'border-transparent text-stone-500 hover:text-stone-900'
const selectedNames = computed(() => selected.value.map((file) => file.original_name).join(', ') || 'No files selected')

watch(() => props.open, (value) => {
  if (value) {
    tab.value = 'browse'
    filters.value.type = props.typeFilter
    void refresh()
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

function toggleSelection(file: MediaRecord) {
  if (!props.multiple) {
    selected.value = [file]
    return
  }

  const exists = selected.value.some((item) => item.hash === file.hash)
  selected.value = exists
    ? selected.value.filter((item) => item.hash !== file.hash)
    : [...selected.value, file]
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

function confirmSelection() {
  const values = selected.value.map((file) => props.returnValue === 'url' ? file.url : file.hash)
  emit('update:modelValue', props.multiple ? values : values[0] || null)
  emit('select', selected.value)
  close()
}

function close() {
  emit('update:open', false)
}
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
