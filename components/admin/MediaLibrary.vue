<template>
  <section class="space-y-5">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-3xl font-semibold tracking-normal text-stone-950">Media Library</h1>
        <p class="text-sm text-stone-500">{{ total }} file<template v-if="total !== 1">s</template></p>
      </div>
      <UButton icon="i-lucide-settings" to="/admin/settings#media" color="neutral" variant="soft">Settings</UButton>
    </div>

    <div class="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <MediaFolderTree
        :folders="folders"
        :month-folders="monthFolders"
        :mode="mode"
        :selected-folder="selectedFolder"
        :selected-month="selectedMonth"
        @select-all="selectAll"
        @select-orphans="selectOrphans"
        @select-folder="selectFolder"
        @select-month="selectMonth"
        @create-folder="handleCreateFolder"
        @rename-folder="handleRenameFolder"
        @delete-folder="handleDeleteFolder"
        @assign-file="assignFileToFolder"
      />

      <div class="min-w-0 space-y-5">
        <details class="rounded-lg border border-stone-200 bg-white p-4">
          <summary class="cursor-pointer text-sm font-medium text-stone-900">Upload files</summary>
          <div class="mt-4">
            <MediaUploader @upload-complete="handleUploadComplete" @view-media="openById" />
          </div>
        </details>

        <MediaSearchBar v-model="filters" @search="handleSearch" />

        <div v-if="notice" class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">{{ notice }}</div>
        <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">{{ error }}</div>

        <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <USkeleton v-for="index in 10" :key="index" class="aspect-square rounded-lg" />
        </div>

        <MediaOrphansView
          v-else-if="mode === 'orphans'"
          :files="files"
          @select="selectedMedia = $event"
          @cleanup-complete="handleCleanupComplete"
        />

        <div v-else-if="!files.length" class="rounded-lg border border-dashed border-stone-300 bg-white py-14 text-center">
          <UIcon name="i-lucide-inbox" class="mx-auto mb-2 size-10 text-stone-400" />
          <p class="text-sm text-stone-600">No media files found</p>
        </div>

        <MediaGrid
          v-else
          :files="files"
          :page="page"
          :pages="pages"
          @select="selectedMedia = $event"
          @change-page="changePage"
        />
      </div>
    </div>

    <MediaDetailPanel
      :file="selectedMedia"
      :folders="folders"
      @close="selectedMedia = null"
      @updated="handleFileUpdated"
      @deleted="handleFileDeleted"
    />
  </section>
</template>

<script setup lang="ts">
import type { MediaFolderRecord, MediaRecord } from '~/types/content'
import MediaDetailPanel from '~/components/admin/MediaDetailPanel.vue'
import MediaFolderTree from '~/components/admin/MediaFolderTree.vue'
import MediaGrid from '~/components/admin/MediaGrid.vue'
import MediaOrphansView from '~/components/admin/MediaOrphansView.vue'
import MediaSearchBar from '~/components/admin/MediaSearchBar.vue'
import MediaUploader from '~/components/admin/MediaUploader.vue'

interface MediaFilters {
  search: string
  type: string
  tag: string
  uploaded_from: string
  uploaded_to: string
}

interface MediaMonthFolder {
  label: string
  value: string
}

const {
  listMedia,
  getMedia,
  updateMedia,
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder
} = useMedia()

const files = ref<MediaRecord[]>([])
const folders = ref<MediaFolderRecord[]>([])
const monthSeedFiles = ref<MediaRecord[]>([])
const selectedMedia = ref<MediaRecord | null>(null)
const loading = ref(true)
const total = ref(0)
const page = ref(1)
const pages = ref(1)
const mode = ref<'all' | 'folder' | 'month' | 'orphans'>('all')
const selectedFolder = ref('')
const selectedMonth = ref('')
const notice = ref('')
const error = ref('')
const filters = ref<MediaFilters>({
  search: '',
  type: 'all',
  tag: '',
  uploaded_from: '',
  uploaded_to: ''
})

const monthFolders = computed<MediaMonthFolder[]>(() => {
  const months = new Map<string, string>()

  for (const file of monthSeedFiles.value) {
    const value = (file.uploaded_at || file.created_at || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(value)) continue
    const date = new Date(`${value}-01T00:00:00Z`)
    months.set(value, new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date))
  }

  return [...months.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([value, label]) => ({ value, label }))
})

onMounted(async () => {
  await Promise.all([loadFolders(), loadMedia(), refreshMonthSeed()])
})

async function loadMedia() {
  loading.value = true
  error.value = ''
  try {
    const range = mode.value === 'month' ? monthRange(selectedMonth.value) : null
    const response = await listMedia({
      page: page.value,
      limit: 24,
      search: filters.value.search,
      type: filters.value.type as any,
      tag: filters.value.tag,
      uploaded_from: range?.from || filters.value.uploaded_from,
      uploaded_to: range?.to || filters.value.uploaded_to,
      folder: mode.value === 'folder' ? selectedFolder.value : undefined,
      orphan: mode.value === 'orphans'
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

async function refreshMonthSeed() {
  const response = await listMedia({ page: 1, limit: 100 })
  monthSeedFiles.value = response.files
}

function handleSearch() {
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
  selectedMonth.value = ''
  page.value = 1
  void loadMedia()
}

function selectOrphans() {
  mode.value = 'orphans'
  selectedFolder.value = ''
  selectedMonth.value = ''
  page.value = 1
  void loadMedia()
}

function selectFolder(id: string) {
  mode.value = 'folder'
  selectedFolder.value = id
  selectedMonth.value = ''
  page.value = 1
  void loadMedia()
}

function selectMonth(month: string) {
  mode.value = 'month'
  selectedMonth.value = month
  selectedFolder.value = ''
  page.value = 1
  void loadMedia()
}

async function handleCreateFolder(name: string) {
  await createFolder(name)
  await loadFolders()
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

async function handleUploadComplete() {
  page.value = 1
  await Promise.all([loadMedia(), refreshMonthSeed()])
}

async function openById(id: string) {
  selectedMedia.value = await getMedia(id)
}

function handleFileUpdated(file: MediaRecord) {
  files.value = files.value.map((item) => item.hash === file.hash ? file : item)
  if (selectedMedia.value?.hash === file.hash) {
    selectedMedia.value = file
  }
}

async function handleFileDeleted(file: MediaRecord) {
  files.value = files.value.filter((item) => item.hash !== file.hash)
  selectedMedia.value = null
  await refreshMonthSeed()
  await loadMedia()
}

async function handleCleanupComplete() {
  selectedMedia.value = null
  await Promise.all([loadMedia(), refreshMonthSeed()])
}

function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  const [year = 0, monthNumber = 1] = month.split('-').map(Number)
  const from = new Date(Date.UTC(year, monthNumber - 1, 1))
  const to = new Date(Date.UTC(year, monthNumber, 1) - 1)
  return {
    from: from.toISOString(),
    to: to.toISOString()
  }
}
</script>
