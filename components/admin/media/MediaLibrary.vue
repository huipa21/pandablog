<template>
  <section class="space-y-5">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-3xl font-semibold tracking-normal text-stone-950">Media Library</h1>
        <p class="text-sm text-stone-500">{{ total }} file<template v-if="total !== 1">s</template></p>
      </div>
      <div class="flex items-center gap-2">
        <UButton type="button" icon="i-lucide-upload" @click="uploadModalOpen = true">Upload files</UButton>
        <UButton type="button" icon="i-lucide-search" color="neutral" variant="soft" @click="searchModalOpen = true">Search</UButton>
        <div class="flex rounded-md border border-stone-200">
          <button
            type="button"
            class="rounded-l-md px-2 py-1.5 text-stone-600 transition hover:bg-stone-100"
            :class="viewMode === 'grid' ? 'bg-stone-100 text-stone-900' : ''"
            @click="setViewMode('grid')"
          >
            <UIcon name="i-lucide-grid-2x2" class="size-4" />
          </button>
          <button
            type="button"
            class="rounded-r-md px-2 py-1.5 text-stone-600 transition hover:bg-stone-100"
            :class="viewMode === 'list' ? 'bg-stone-100 text-stone-900' : ''"
            @click="setViewMode('list')"
          >
            <UIcon name="i-lucide-list" class="size-4" />
          </button>
        </div>
        <UButton icon="i-lucide-settings" to="/admin/settings/media" color="neutral" variant="soft">Settings</UButton>
      </div>
    </div>

    <div class="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <MediaFolderTree
        :folders="folders"
        :media-tags="mediaTags"
        :smart-folders="smartFolders"
        :mode="mode"
        :selected-folder="selectedFolder"
        :selected-smart-folder="selectedSmartFolder"
        @select-all="selectAll"
        @select-folder="selectFolder"
        @select-tags-view="selectTagsView"
        @select-smart-folder="selectSmartFolderById"
        @create-folder="openFolderModal"
        @rename-folder="handleRenameFolder"
        @delete-folder="handleDeleteFolder"
        @assign-file="assignFileToFolder"
        @create-smart-folder="openSmartFolderModal()"
        @edit-smart-folder="openSmartFolderModal($event)"
        @delete-smart-folder="handleDeleteSmartFolder"
      />

      <div class="min-w-0 space-y-5">
        <!-- Active filters indicator -->
        <div v-if="hasActiveFilters && mode !== 'smart'" class="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <UIcon name="i-lucide-filter" class="size-4 text-amber-700" />
          <span class="text-sm font-medium text-amber-800">Active filters:</span>
          <span v-if="filters.file_name" class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Name: {{ filters.file_name }}</span>
          <span v-if="filters.extension" class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Ext: {{ filters.extension }}</span>
          <span v-if="filters.comment" class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Comment: {{ filters.comment }}</span>
          <span v-if="filters.tags.length" class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Tags<span v-if="filters.tags.length > 1"> ({{ selectedTagRelationLabel }})</span>: {{ filters.tags.join(', ') }}</span>
          <span v-if="filters.type && filters.type !== 'all'" class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Type: {{ filters.type }}</span>
          <span v-if="filters.uploaded_from || filters.uploaded_to" class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Date range</span>
          <span v-if="filters.orphan" class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Orphans only</span>
          <span v-if="filters.advanced" class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Advanced query</span>
          <UButton type="button" icon="i-lucide-x" size="xs" color="warning" variant="soft" class="ml-auto" @click="clearFilters">Clear filters</UButton>
        </div>

        <!-- Tags view -->
        <div v-if="mode === 'tag'" class="space-y-4 rounded-lg border border-stone-200 bg-white p-5">
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold text-stone-950">Tags</h2>
            <UInput v-model="tagSearch" size="sm" icon="i-lucide-search" placeholder="Search tags..." class="max-w-xs" />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <div v-if="selectedMediaTags.length" class="flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 p-1">
              <span class="px-2 text-xs font-medium uppercase tracking-wide text-stone-500">Match</span>
              <button
                type="button"
                class="rounded-md px-2.5 py-1 text-xs font-semibold transition"
                :class="selectedTagRelation === 'and' ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-500 hover:text-stone-800'"
                @click="setSelectedTagRelation('and')"
              >
                AND
              </button>
              <button
                type="button"
                class="rounded-md px-2.5 py-1 text-xs font-semibold transition"
                :class="selectedTagRelation === 'or' ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-500 hover:text-stone-800'"
                @click="setSelectedTagRelation('or')"
              >
                OR
              </button>
            </div>
            <UButton v-if="selectedMediaTags.length" type="button" icon="i-lucide-x" size="xs" color="neutral" variant="soft" @click="clearTagSelection">Clear selection</UButton>
            <p class="text-sm text-stone-500">
              <template v-if="selectedMediaTags.length">{{ selectedMediaTags.length }} tag<template v-if="selectedMediaTags.length !== 1">s</template> selected</template>
              <template v-else>Select one or more tags to filter files.</template>
            </p>
          </div>
          <div v-if="visibleMediaTags.length" class="flex flex-wrap gap-2">
            <button
              v-for="tag in visibleMediaTags"
              :key="tag.id"
              type="button"
              class="rounded-full px-3 py-1.5 font-medium transition hover:-translate-y-0.5 hover:bg-teal-50 hover:text-teal-800"
              :class="isMediaTagSelected(tag.name) ? 'bg-teal-100 text-teal-900 ring-1 ring-teal-200' : 'bg-stone-100 text-stone-700'"
              :style="tagStyle(tag.count)"
              @click="toggleMediaTag(tag.name)"
            >
              #{{ tag.name }}
              <span class="ml-1 text-stone-400">{{ tag.count }}</span>
            </button>
          </div>
          <p v-else class="text-sm text-stone-500">No tags found</p>
        </div>

        <!-- File grid toolbar -->
        <div v-if="mode !== 'tag' || selectedMediaTags.length" class="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white p-3">
          <UButton type="button" icon="i-lucide-check-check" color="neutral" variant="soft" @click="selectAllFiles">Select all</UButton>
          <UButton type="button" icon="i-lucide-eraser" color="neutral" variant="ghost" :disabled="selectedHashes.size === 0" @click="clearSelection">Clear</UButton>
          <UDropdownMenu :items="bulkActionItems">
            <UButton type="button" icon="i-lucide-more-horizontal" color="neutral" variant="soft" :disabled="selectedHashes.size === 0">
              Actions<template v-if="selectedHashes.size"> ({{ selectedHashes.size }})</template>
            </UButton>
          </UDropdownMenu>
          <div class="ml-auto flex flex-wrap items-center gap-2">
            <div class="text-sm text-stone-500">Page {{ page }} of {{ pages }}</div>
            <UButton type="button" icon="i-lucide-chevron-left" color="neutral" variant="ghost" :disabled="page <= 1" @click="changePage(page - 1)" />
            <UButton type="button" icon="i-lucide-chevron-right" color="neutral" variant="ghost" :disabled="page >= pages" @click="changePage(page + 1)" />
            <div class="w-44">
              <USelect :model-value="sortBy" :items="sortItems" @update:model-value="changeSort(String($event))" />
            </div>
            <div class="w-32">
              <USelect :model-value="String(itemsPerPage)" :items="pageSizeItems" @update:model-value="changePageSize(String($event))" />
            </div>
          </div>
        </div>

        <div v-if="notice" class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">{{ notice }}</div>
        <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">{{ error }}</div>

        <template v-if="mode !== 'tag' || selectedMediaTags.length">
          <div v-if="loading" class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            <USkeleton v-for="index in 10" :key="index" class="aspect-square rounded-lg" />
          </div>

          <div v-else-if="!files.length" class="rounded-lg border border-dashed border-stone-300 bg-white py-14 text-center">
            <UIcon name="i-lucide-inbox" class="mx-auto mb-2 size-10 text-stone-400" />
            <p class="text-sm text-stone-600">No media files found</p>
          </div>

          <MediaGrid
            v-else
            :files="files"
            :page="page"
            :pages="pages"
            :selected-hashes="[...selectedHashes]"
            :view-mode="viewMode"
            :show-pagination="false"
            @select="handleItemClick"
            @toggle-select="toggleSelection($event.hash)"
            @range-select="selectRangeTo($event.hash)"
            @drag-select="addDragSelection"
            @change-page="changePage"
          />
        </template>
      </div>
    </div>

    <MediaDetailPanel
      :file="selectedMedia"
      :folders="folders"
      @close="selectedMedia = null"
      @updated="handleFileUpdated"
      @deleted="handleFileDeleted"
    />

    <MediaSmartFolderModal
      v-if="smartFolderModalOpen"
      :folder="editingSmartFolder"
      @close="smartFolderModalOpen = false"
      @saved="handleSmartFolderSaved"
    />

    <MediaFolderModal
      v-if="folderModalOpen"
      @close="folderModalOpen = false"
      @create="handleCreateFolder"
    />

    <Teleport to="body">
      <div v-if="uploadModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button type="button" class="absolute inset-0 bg-black/40" aria-label="Close" @click="uploadModalOpen = false" />
        <section class="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
          <header class="flex items-center justify-between border-b border-stone-200 p-4">
            <h2 class="text-lg font-semibold text-stone-950">Upload files</h2>
            <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" @click="uploadModalOpen = false" />
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto p-4">
            <MediaUploader @upload-complete="handleUploadComplete" @view-media="openById" />
          </div>
        </section>
      </div>
    </Teleport>

    <MediaSearchModal
      v-if="searchModalOpen"
      :model-value="searchPayload"
      @close="searchModalOpen = false"
      @apply="handleAdvancedSearch"
    />
  </section>
</template>

<script setup lang="ts">
import type { MediaFolderRecord, MediaRecord, MediaTagSummary } from '~/types/content'
import MediaDetailPanel from '~/components/admin/media/MediaDetailPanel.vue'
import MediaFolderTree from '~/components/admin/media/MediaFolderTree.vue'
import MediaGrid from '~/components/admin/media/MediaGrid.vue'
import MediaUploader from '~/components/admin/media/MediaUploader.vue'
import MediaSmartFolderModal from '~/components/admin/media/MediaSmartFolderModal.vue'
import MediaSearchModal from '~/components/admin/media/MediaSearchModal.vue'
import MediaFolderModal from '~/components/admin/media/MediaFolderModal.vue'

interface MediaFilters {
  search: string
  file_name: string
  extension: string
  comment: string
  tags: string[]
  type: string
  tag: string
  uploaded_from: string
  uploaded_to: string
  orphan: boolean
  search_regex: boolean
  case_insensitive: boolean
  filename_regex: string
  filename_regex_case_insensitive: boolean
  advanced: unknown | null
}

interface SmartFolder {
  id: string
  name: string
  filters: {
    tags?: string[]
    filename_regex?: string
    filename_regex_case_insensitive?: boolean
    file_type?: string
    date_from?: string
    date_to?: string
    orphan_only?: boolean
  }
}

const {
  listMedia,
  getMedia,
  updateMedia,
  deleteMedia,
  listFolders,
  listMediaTags,
  createFolder,
  updateFolder,
  deleteFolder
} = useMedia()

const files = ref<MediaRecord[]>([])
const folders = ref<MediaFolderRecord[]>([])
const mediaTags = ref<MediaTagSummary[]>([])
const smartFolders = ref<SmartFolder[]>([])
const selectedMedia = ref<MediaRecord | null>(null)
const selectedHashes = ref<Set<string>>(new Set())
const lastSelectedHash = ref('')
const loading = ref(true)
const total = ref(0)
const page = ref(1)
const pages = ref(1)
const mode = ref<'all' | 'folder' | 'smart' | 'tag'>('all')
const selectedFolder = ref('')
const selectedMediaTags = ref<string[]>([])
const selectedTagRelation = ref<'and' | 'or'>('and')
const selectedSmartFolder = ref('')
const notice = ref('')
const error = ref('')
const viewMode = ref<'grid' | 'list'>((typeof localStorage !== 'undefined' && localStorage.getItem('media-view-mode') as 'grid' | 'list') || 'grid')
const itemsPerPage = ref(25)
const sortBy = ref('uploaded_at_desc')
const uploadModalOpen = ref(false)
const searchModalOpen = ref(false)
const smartFolderModalOpen = ref(false)
const editingSmartFolder = ref<SmartFolder | null>(null)
const folderModalOpen = ref(false)

const filters = ref<MediaFilters>({
  search: '',
  file_name: '',
  extension: '',
  comment: '',
  tags: [],
  type: 'all',
  tag: '',
  uploaded_from: '',
  uploaded_to: '',
  orphan: false,
  search_regex: false,
  case_insensitive: true,
  filename_regex: '',
  filename_regex_case_insensitive: true,
  advanced: null
})

const searchPayload = computed(() => filters.value)

const hasActiveFilters = computed(() => {
  const f = filters.value
  return !!(f.file_name || f.extension || f.comment || f.tags.length || (f.type && f.type !== 'all') || f.uploaded_from || f.uploaded_to || f.orphan || f.advanced || f.filename_regex || f.search)
})

const selectedTagRelationLabel = computed(() => selectedTagRelation.value.toUpperCase())

const bulkActionItems = computed(() => {
  const disabled = selectedHashes.value.size === 0
  return [
    [
      { label: 'Edit tags', icon: 'i-lucide-tags', disabled, onSelect: promptBulkTags },
      { label: 'Edit comment', icon: 'i-lucide-message-square', disabled, onSelect: promptBulkComment }
    ],
    [
      { label: 'Assign folder', icon: 'i-lucide-folder-symlink', disabled, onSelect: promptBulkAssignFolder }
    ],
    [
      { label: 'Download', icon: 'i-lucide-download', disabled, onSelect: handleBulkDownload }
    ],
    [
      { label: 'Delete selected', icon: 'i-lucide-trash-2', color: 'error' as const, disabled, onSelect: handleBulkDelete }
    ]
  ]
})

const sortItems = [
  { label: 'Newest first', value: 'uploaded_at_desc' },
  { label: 'Oldest first', value: 'uploaded_at_asc' },
  { label: 'Name A-Z', value: 'name_asc' },
  { label: 'Name Z-A', value: 'name_desc' },
  { label: 'Size small-large', value: 'size_asc' },
  { label: 'Size large-small', value: 'size_desc' }
]

const pageSizeItems = [
  { label: '25 / page', value: '25' },
  { label: '50 / page', value: '50' },
  { label: '100 / page', value: '100' }
]

function setViewMode(mode: 'grid' | 'list') {
  viewMode.value = mode
  if (typeof localStorage !== 'undefined') localStorage.setItem('media-view-mode', mode)
}

const tagSearch = ref('')
const maxTagCount = computed(() => Math.max(1, ...mediaTags.value.map((tag) => tag.count)))
const visibleMediaTags = computed(() => {
  const query = tagSearch.value.trim().toLowerCase()
  return mediaTags.value
    .filter((tag) => !query || tag.name.toLowerCase().includes(query))
    .slice(0, 50)
})

function tagStyle(count: number) {
  const weight = Math.max(0, Math.min(1, count / maxTagCount.value))
  return {
    fontSize: `${0.75 + weight * 0.5}rem`,
    lineHeight: '1.2'
  }
}

onMounted(async () => {
  await Promise.all([loadFolders(), loadMedia(), loadSmartFolders(), loadMediaTags()])
})

async function loadMedia() {
  loading.value = true
  error.value = ''
  try {
    const activeTagFilters = filters.value.tags.length
      ? [...filters.value.tags]
      : (filters.value.tag ? [filters.value.tag] : [])
    const response = await listMedia({
      page: page.value,
      limit: itemsPerPage.value,
      search: filters.value.search,
      file_name: filters.value.file_name,
      extension: filters.value.extension,
      comment: filters.value.comment,
      tags: activeTagFilters,
      tag_relation: activeTagFilters.length > 1 ? selectedTagRelation.value : 'and',
      search_regex: filters.value.search_regex,
      case_insensitive: filters.value.case_insensitive,
      filename_regex: filters.value.filename_regex || undefined,
      filename_regex_case_insensitive: filters.value.filename_regex_case_insensitive,
      advanced: filters.value.advanced,
      sort: sortBy.value,
      type: filters.value.type as any,
      uploaded_from: filters.value.uploaded_from,
      uploaded_to: filters.value.uploaded_to,
      folder: mode.value === 'folder' ? selectedFolder.value : undefined,
      orphan: filters.value.orphan
    })
    files.value = response.files
    total.value = response.total
    pages.value = response.pages || 1
  } catch (err: any) {
    error.value = err?.statusMessage || err?.message || 'Failed to load media'
  } finally {
    loading.value = false
  }
}

async function loadFolders() {
  const response = await listFolders()
  folders.value = response.folders
}

async function loadMediaTags() {
  const response = await listMediaTags()
  mediaTags.value = response.tags
}

async function loadSmartFolders() {
  try {
    const response = await $fetch<{ folders: SmartFolder[] }>('/api/media/smart-folders')
    smartFolders.value = response.folders
  } catch { /* smart folders not yet created */ }
}

function handleAdvancedSearch(value: MediaFilters) {
  filters.value = { ...defaultFilters(), ...value }
  mode.value = 'all'
  selectedFolder.value = ''
  selectedMediaTags.value = []
  selectedTagRelation.value = 'and'
  selectedSmartFolder.value = ''
  searchModalOpen.value = false
  page.value = 1
  void loadMedia()
}

function changePage(nextPage: number) {
  page.value = nextPage
  void loadMedia()
}

function selectAll() {
  mode.value = 'all'
  selectedFolder.value = ''
  selectedMediaTags.value = []
  selectedTagRelation.value = 'and'
  selectedSmartFolder.value = ''
  filters.value.tag = ''
  filters.value.tags = []
  filters.value.filename_regex = ''
  filters.value.filename_regex_case_insensitive = true
  filters.value.advanced = null
  page.value = 1
  void loadMedia()
}

function selectTagsView() {
  mode.value = 'tag'
  selectedFolder.value = ''
  selectedMediaTags.value = []
  selectedTagRelation.value = 'and'
  selectedSmartFolder.value = ''
  filters.value = defaultFilters()
  page.value = 1
}

function clearFilters() {
  if (mode.value === 'tag' && selectedMediaTags.value.length) {
    clearTagSelection()
    return
  }
  filters.value = defaultFilters()
  page.value = 1
  void loadMedia()
}

function selectFolder(id: string) {
  mode.value = 'folder'
  selectedFolder.value = id
  selectedMediaTags.value = []
  selectedTagRelation.value = 'and'
  selectedSmartFolder.value = ''
  filters.value.filename_regex = ''
  filters.value.filename_regex_case_insensitive = true
  filters.value.advanced = null
  filters.value.tag = ''
  filters.value.tags = []
  page.value = 1
  void loadMedia()
}

function setSelectedTagRelation(relation: 'and' | 'or') {
  if (selectedTagRelation.value === relation) return
  selectedTagRelation.value = relation
  if (mode.value === 'tag' && selectedMediaTags.value.length) {
    page.value = 1
    void loadMedia()
  }
}

function clearTagSelection() {
  mode.value = 'tag'
  selectedMediaTags.value = []
  selectedTagRelation.value = 'and'
  selectedFolder.value = ''
  selectedSmartFolder.value = ''
  filters.value = defaultFilters()
  page.value = 1
}

function applySelectedMediaTags() {
  mode.value = 'tag'
  selectedFolder.value = ''
  selectedSmartFolder.value = ''
  sortBy.value = 'uploaded_at_desc'
  filters.value = {
    ...defaultFilters(),
    tags: [...selectedMediaTags.value]
  }
  page.value = 1
  void loadMedia()
}

function toggleMediaTag(tag: string) {
  const next = new Set(selectedMediaTags.value)
  if (next.has(tag)) {
    next.delete(tag)
  } else {
    next.add(tag)
  }

  selectedMediaTags.value = [...next]

  if (!selectedMediaTags.value.length) {
    clearTagSelection()
    return
  }

  applySelectedMediaTags()
}

function isMediaTagSelected(tag: string) {
  return selectedMediaTags.value.includes(tag)
}

function selectSmartFolderById(id: string) {
  const sf = smartFolders.value.find((f) => f.id === id)
  if (!sf) return
  mode.value = 'smart'
  selectedSmartFolder.value = id
  selectedFolder.value = ''
  selectedMediaTags.value = []
  selectedTagRelation.value = 'and'
  // Apply smart folder filters
  filters.value = {
    search: '',
    file_name: '',
    extension: '',
    comment: '',
    tags: sf.filters.tags || [],
    search_regex: false,
    case_insensitive: true,
    filename_regex: sf.filters.filename_regex || '',
    filename_regex_case_insensitive: sf.filters.filename_regex_case_insensitive !== false,
    advanced: null,
    type: sf.filters.file_type || 'all',
    tag: '',
    uploaded_from: sf.filters.date_from || '',
    uploaded_to: sf.filters.date_to || '',
    orphan: sf.filters.orphan_only || false
  }
  page.value = 1
  void loadMedia()
}

function handleItemClick(file: MediaRecord) {
  if (selectedHashes.value.size > 0) {
    toggleSelection(file.hash)
  } else {
    selectedMedia.value = file
  }
}

function toggleSelection(hash: string) {
  const next = new Set(selectedHashes.value)
  if (next.has(hash)) next.delete(hash)
  else next.add(hash)
  selectedHashes.value = next
  lastSelectedHash.value = hash
}

function selectAllFiles() {
  selectedHashes.value = new Set(files.value.map((f) => f.hash))
  if (files.value[0]) lastSelectedHash.value = files.value[0].hash
}

function clearSelection() {
  selectedHashes.value = new Set()
  lastSelectedHash.value = ''
}

function selectRangeTo(hash: string) {
  const targetIndex = files.value.findIndex((file) => file.hash === hash)
  const startIndex = files.value.findIndex((file) => file.hash === lastSelectedHash.value)

  if (targetIndex === -1 || startIndex === -1) {
    toggleSelection(hash)
    return
  }

  const [from, to] = startIndex < targetIndex ? [startIndex, targetIndex] : [targetIndex, startIndex]
  const next = new Set(selectedHashes.value)
  for (const file of files.value.slice(from, to + 1)) {
    next.add(file.hash)
  }
  selectedHashes.value = next
  lastSelectedHash.value = hash
}

function addDragSelection(hash: string) {
  const next = new Set(selectedHashes.value)
  next.add(hash)
  selectedHashes.value = next
  lastSelectedHash.value = hash
}

function changeSort(nextSort: string) {
  sortBy.value = nextSort
  page.value = 1
  void loadMedia()
}

function changePageSize(nextSize: string) {
  const parsed = Number(nextSize)
  itemsPerPage.value = Number.isFinite(parsed) ? parsed : 24
  page.value = 1
  void loadMedia()
}

async function handleBulkDelete() {
  if (!window.confirm(`Delete ${selectedHashes.value.size} file(s)? This cannot be undone.`)) return
  try {
    await $fetch('/api/media/bulk', {
      method: 'POST',
      body: { action: 'delete', hashes: [...selectedHashes.value] }
    })
    notice.value = `Deleted ${selectedHashes.value.size} file(s)`
    selectedHashes.value = new Set()
    await loadMedia()
    await loadMediaTags()
  } catch (err: any) {
    error.value = err?.statusMessage || err?.message || 'Bulk delete failed'
  }
}

function promptBulkTags() {
  const input = window.prompt('Enter tags (comma separated) to set on selected files:')
  if (input === null) return
  const tags = input.split(',').map((tag) => tag.trim()).filter(Boolean)
  void handleBulkTags(tags)
}

function promptBulkComment() {
  const input = window.prompt('Enter comment to set on selected files:')
  if (input === null) return
  void handleBulkComment(input)
}

async function handleBulkTags(tags: string[]) {
  try {
    await $fetch('/api/media/bulk', {
      method: 'POST',
      body: { action: 'update', hashes: [...selectedHashes.value], data: { tags } }
    })
    notice.value = `Updated tags on ${selectedHashes.value.size} file(s)`
    selectedHashes.value = new Set()
    await loadMedia()
    await loadMediaTags()
  } catch (err: any) {
    error.value = err?.statusMessage || err?.message || 'Bulk tag update failed'
  }
}

async function handleBulkComment(comment: string) {
  try {
    await $fetch('/api/media/bulk', {
      method: 'POST',
      body: { action: 'update', hashes: [...selectedHashes.value], data: { comment } }
    })
    notice.value = `Updated comment on ${selectedHashes.value.size} file(s)`
    selectedHashes.value = new Set()
    await loadMedia()
  } catch (err: any) {
    error.value = err?.statusMessage || err?.message || 'Bulk comment update failed'
  }
}

async function handleBulkMove(folderId: string) {
  try {
    await $fetch('/api/media/bulk', {
      method: 'POST',
      body: { action: 'update', hashes: [...selectedHashes.value], data: { folders: [folderId] } }
    })
    notice.value = `Assigned ${selectedHashes.value.size} file(s) to folder`
    selectedHashes.value = new Set()
    await loadMedia()
  } catch (err: any) {
    error.value = err?.statusMessage || err?.message || 'Bulk assign failed'
  }
}

function promptBulkAssignFolder() {
  const folderOptions = folders.value.map((f) => f.name).join(', ')
  const input = window.prompt(`Assign to which folder? (${folderOptions})`)
  if (input === null) return
  const folder = folders.value.find((f) => f.name.toLowerCase() === input.trim().toLowerCase())
  if (!folder) {
    error.value = `Folder "${input}" not found`
    return
  }
  void handleBulkMove(folder.id)
}

async function handleBulkAddToFolder(folderId: string) {
  try {
    await $fetch('/api/media/bulk', {
      method: 'POST',
      body: { action: 'update', hashes: [...selectedHashes.value], data: { folders: [folderId], folderMode: 'add' } }
    })
    notice.value = `Added ${selectedHashes.value.size} file(s) to folder`
    selectedHashes.value = new Set()
    await loadMedia()
  } catch (err: any) {
    error.value = err?.statusMessage || err?.message || 'Bulk folder update failed'
  }
}

async function handleBulkDownload() {
  try {
    const response = await $fetch<{ type: string; url: string }>('/api/media/download', {
      method: 'POST',
      body: { hashes: [...selectedHashes.value] }
    })
    // Trigger download
    const link = document.createElement('a')
    link.href = response.url
    link.download = ''
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    notice.value = 'Download started'
  } catch (err: any) {
    error.value = err?.statusMessage || err?.message || 'Download failed'
  }
}

function openFolderModal() {
  folderModalOpen.value = true
}

async function handleCreateFolder(name: string) {
  try {
    await createFolder(name)
    folderModalOpen.value = false
    notice.value = `Created folder "${name}"`
    await loadFolders()
  } catch (err: any) {
    error.value = err?.statusMessage || err?.message || 'Failed to create folder'
  }
}

async function handleRenameFolder(id: string, name: string) {
  await updateFolder(id, { name })
  await loadFolders()
}

async function handleDeleteFolder(id: string) {
  await deleteFolder(id)
  if (selectedFolder.value === id) selectAll()
  await loadFolders()
  await loadMedia()
}

async function assignFileToFolder(hash: string, folderId: string) {
  const file = files.value.find((item) => item.hash === hash) || await getMedia(hash)
  const foldersForFile = Array.from(new Set([...(file.folders || []), folderId]))
  const updated = await updateMedia(file.id, { folders: foldersForFile })
  handleFileUpdated(updated)
  notice.value = 'File assigned to folder'
}

async function handleUploadComplete(results: Array<{ status: string }>) {
  mode.value = 'all'
  selectedFolder.value = ''
  selectedSmartFolder.value = ''
  selectedMediaTags.value = []
  filters.value = defaultFilters()
  page.value = 1
  const createdCount = results.filter((result) => result.status === 'created').length
  if (createdCount > 0) {
    notice.value = `Uploaded ${createdCount} file${createdCount === 1 ? '' : 's'}.`
  }
  await loadMedia()
  await loadMediaTags()
}

async function openById(id: string) {
  selectedMedia.value = await getMedia(id)
}

function handleFileUpdated(file: MediaRecord) {
  files.value = files.value.map((item) => item.hash === file.hash ? file : item)
  if (selectedMedia.value?.hash === file.hash) {
    selectedMedia.value = file
  }
  void loadMediaTags()
}

async function handleFileDeleted(file: MediaRecord) {
  files.value = files.value.filter((item) => item.hash !== file.hash)
  selectedMedia.value = null
  await loadMedia()
  await loadMediaTags()
}

// Smart folder modal
function openSmartFolderModal(folder?: SmartFolder) {
  editingSmartFolder.value = folder || null
  smartFolderModalOpen.value = true
}

async function handleSmartFolderSaved() {
  smartFolderModalOpen.value = false
  await loadSmartFolders()
}

async function handleDeleteSmartFolder(id: string) {
  if (!window.confirm('Delete this smart folder?')) return
  await $fetch(`/api/media/smart-folders/${id}`, { method: 'DELETE' })
  if (selectedSmartFolder.value === id) selectAll()
  await loadSmartFolders()
}

function defaultFilters(): MediaFilters {
  return {
    search: '',
    file_name: '',
    extension: '',
    comment: '',
    tags: [],
    type: 'all',
    tag: '',
    uploaded_from: '',
    uploaded_to: '',
    orphan: false,
    search_regex: false,
    case_insensitive: true,
    filename_regex: '',
    filename_regex_case_insensitive: true,
    advanced: null
  }
}
</script>
