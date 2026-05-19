<template>
  <section class="grid gap-6">
    <!-- Header -->
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-3xl font-semibold tracking-normal text-stone-950">Media Library</h1>
      </div>
      <UButton icon="i-lucide-settings" to="/admin/settings#media">
        Settings
      </UButton>
    </div>

    <!-- Upload Section -->
    <div class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <h2 class="mb-4 text-lg font-semibold text-stone-900">Upload Files</h2>
      <MediaUploader @upload-complete="onUploadComplete" @view-media="onViewMedia" />
    </div>

    <!-- Controls -->
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <div class="flex-1">
          <UInput
            v-model="search"
            type="text"
            placeholder="Search by filename..."
            icon="i-lucide-search"
            @update:model-value="handleSearch"
          />
        </div>
        <USelect
          v-model="selectedType"
          :options="typeOptions"
          option-attribute="label"
          value-attribute="value"
          @update:model-value="handleFilterChange"
        />
      </div>
      <div class="text-sm text-stone-600">
        {{ total }} file<template v-if="total !== 1">s</template>
      </div>
    </div>

    <!-- Loading or Empty -->
    <div v-if="loading" class="grid gap-4">
      <USkeleton class="h-48" />
      <USkeleton class="h-48" />
    </div>
    <div v-else-if="files.length === 0" class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-stone-300 py-12 text-center">
      <UIcon name="i-lucide-inbox" class="mb-2 size-12 text-stone-400" />
      <p class="text-stone-700">No media files found</p>
      <p class="text-sm text-stone-500">Upload some files to get started</p>
    </div>

    <!-- Media Grid -->
    <template v-else>
      <MediaGrid
        :files="files"
        :page="currentPage"
        :pages="totalPages"
        :loading="loading"
        @select="selectedMedia = $event"
        @change-page="handlePageChange"
      />
    </template>

    <!-- Detail Drawer -->
    <MediaDetailDrawer
      :file="selectedMedia"
      :open="selectedMedia !== null"
      @close="selectedMedia = null"
      @deleted="onMediaDeleted"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { MediaRecord } from '~/types/content'

definePageMeta({ layout: 'admin' })

const { listMedia, formatFileSize } = useMedia()

// State
const search = ref('')
const selectedType = ref('all')
const currentPage = ref(1)
const selectedMedia = ref<MediaRecord | null>(null)
const loading = ref(true)
const files = ref<MediaRecord[]>([])
const total = ref(0)

const typeOptions = [
  { label: 'All Files', value: 'all' },
  { label: 'Images', value: 'image' },
  { label: 'Documents', value: 'document' },
  { label: 'Archives', value: 'archive' }
]

const totalPages = computed(() => Math.ceil(total.value / 20))

// Load media
const loadMedia = async () => {
  loading.value = true
  try {
    const response = await listMedia({
      page: currentPage.value,
      limit: 20,
      search: search.value,
      type: selectedType.value as any
    })
    files.value = response.files
    total.value = response.total
  } catch (error) {
    console.error('Failed to load media:', error)
  } finally {
    loading.value = false
  }
}

// Event handlers
const handleSearch = () => {
  currentPage.value = 1
  loadMedia()
}

const handleFilterChange = () => {
  currentPage.value = 1
  loadMedia()
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  loadMedia()
}

const onUploadComplete = () => {
  currentPage.value = 1
  loadMedia()
}

const onMediaDeleted = () => {
  loadMedia()
}

const onViewMedia = (id: string) => {
  const media = files.value.find(f => f.id === id)
  if (media) {
    selectedMedia.value = media
  }
}

// Initial load
onMounted(() => {
  loadMedia()
})
</script>
