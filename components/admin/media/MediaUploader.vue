<template>
  <div class="space-y-4">
    <div
      class="rounded-lg border-2 border-dashed bg-white p-6 text-center transition"
      :class="isDragging ? 'border-teal-500 bg-teal-50' : 'border-stone-300 hover:border-stone-400'"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <UIcon name="i-lucide-cloud-upload" class="mx-auto mb-3 size-9 text-stone-400" />
      <div class="text-sm font-medium text-stone-800">Drop files here</div>
      <div class="mt-1 text-xs text-stone-500">{{ mediaConfig.getMaxFileSizeDisplay() }} per file, {{ mediaConfig.getMaxFilesPerUpload() }} at a time</div>
      <UButton type="button" icon="i-lucide-folder-open" size="sm" class="mt-4" @click="fileInput?.click()">
        Select files
      </UButton>
      <input ref="fileInput" type="file" multiple class="hidden" @change="handleFileSelect">
    </div>

    <div v-if="items.length" class="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
      <div class="grid gap-3 md:grid-cols-2">
        <UFormField label="General comment">
          <UTextarea v-model="generalComment" :rows="2" />
        </UFormField>
        <UFormField label="General tags">
          <div class="rounded-md border border-stone-300 px-2 py-1.5">
            <MediaTagInput v-model="generalTags" />
          </div>
        </UFormField>
      </div>

      <div class="space-y-3">
        <div
          v-for="item in items"
          :key="item.id"
          class="grid gap-3 rounded-lg border border-stone-200 p-3 lg:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto]"
        >
          <div class="min-w-0 space-y-1">
            <div class="flex min-w-0 items-center gap-2 text-sm text-stone-700">
              <UIcon :name="getFileIcon(extensionFor(item.file.name), item.file.type)" class="size-4 shrink-0 text-stone-500" />
              <span class="truncate">{{ item.file.name }}</span>
            </div>
            <div class="text-xs text-stone-500">{{ formatFileSize(item.file.size) }}</div>
            <UInput v-model="item.displayName" size="sm" />
          </div>

          <UFormField label="Comment override">
            <UTextarea v-model="item.comment" :rows="2" />
          </UFormField>

          <UFormField label="Tag override">
            <div class="rounded-md border border-stone-300 px-2 py-1.5">
              <MediaTagInput v-model="item.tags" />
            </div>
          </UFormField>

          <div class="flex items-start justify-end">
            <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" :disabled="uploading" @click="removeItem(item.id)" />
          </div>

          <div v-if="uploading" class="lg:col-span-4">
            <div class="mb-1 flex justify-between text-xs text-stone-500">
              <span>Upload progress</span>
              <span>{{ item.progress }}%</span>
            </div>
            <UProgress :value="item.progress" class="h-1" />
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <UButton type="button" color="neutral" variant="ghost" :disabled="uploading" @click="clearQueue">Clear</UButton>
        <UButton type="button" icon="i-lucide-upload" :loading="uploading" :disabled="!items.length" @click="uploadQueuedFiles">
          Upload {{ items.length }} file<template v-if="items.length !== 1">s</template>
        </UButton>
      </div>
    </div>

    <div v-if="uploadResults.length" class="grid gap-2">
      <div
        v-for="(result, index) in uploadResults"
        :key="`${result.original_name}-${index}`"
        class="flex items-start gap-3 rounded-lg border p-3 text-sm"
        :class="resultClass(result.status)"
      >
        <UIcon :name="resultIcon(result.status)" class="mt-0.5 size-5 shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="truncate font-medium">{{ result.original_name || result.record?.original_name || 'File' }}</div>
          <div class="text-xs opacity-80">{{ resultText(result) }}</div>
          <button
            v-if="result.record || result.similar_to"
            type="button"
            class="mt-1 text-xs underline"
            @click="emit('view-media', (result.record || result.similar_to)!.id)"
          >
            View file
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MediaRecord, UploadFileResult, UploadResultStatus } from '~/types/content'
import MediaTagInput from '~/components/admin/media/MediaTagInput.vue'

interface UploadQueueItem {
  id: string
  file: File
  displayName: string
  comment: string
  tags: string[]
  progress: number
}

const emit = defineEmits<{
  'upload-complete': [results: UploadFileResult[]]
  'view-media': [id: string]
}>()

const fileInput = ref<HTMLInputElement>()
const isDragging = ref(false)
const items = ref<UploadQueueItem[]>([])
const generalComment = ref('')
const generalTags = ref<string[]>([])
const uploadResults = ref<UploadFileResult[]>([])
const uploading = ref(false)

const { uploadFiles, updateMedia, formatFileSize, getFileIcon } = useMedia()
const mediaConfig = useMediaConfig()

async function handleDrop(event: DragEvent) {
  isDragging.value = false
  addFiles(Array.from(event.dataTransfer?.files ?? []))
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles(Array.from(input.files ?? []))
  resetInput()
}

function addFiles(files: File[]) {
  uploadResults.value = []
  const remainingSlots = mediaConfig.getMaxFilesPerUpload() - items.value.length
  const incoming = files.slice(0, Math.max(0, remainingSlots))

  for (const file of incoming) {
    const validation = mediaConfig.validateFileBeforeUpload(file)
    if (!validation.valid) {
      uploadResults.value.push({ original_name: file.name, status: 'rejected', reason: validation.reason })
      continue
    }

    items.value.push({
      id: `${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2)}`,
      file,
      displayName: file.name,
      comment: '',
      tags: [],
      progress: 0
    })
  }

  if (files.length > incoming.length) {
    uploadResults.value.push({
      status: 'rejected',
      reason: `Maximum ${mediaConfig.getMaxFilesPerUpload()} files per upload allowed`
    })
  }
}

function removeItem(id: string) {
  items.value = items.value.filter((item) => item.id !== id)
}

function clearQueue() {
  items.value = []
  generalComment.value = ''
  generalTags.value = []
}

async function uploadQueuedFiles() {
  if (!items.value.length) return
  uploading.value = true
  uploadResults.value = []
  const results: UploadFileResult[] = []

  try {
    for (const item of items.value) {
      item.progress = 0
      const uploadFile = fileWithDisplayName(item.file, item.displayName)
      const response = await uploadFiles([uploadFile], (_file, progress) => {
        item.progress = progress
      })
      const result = response.results[0]
      if (!result) continue

      const comment = item.comment.trim() || generalComment.value.trim()
      const tags = item.tags.length ? item.tags : generalTags.value
      const record = result.record

      if (record && (comment || tags.length || item.displayName.trim())) {
        result.record = await updateUploadedRecord(record, item.displayName, comment, tags)
      }

      results.push(result)
      uploadResults.value.push(result)
    }

    items.value = []
    emit('upload-complete', results)
  } finally {
    uploading.value = false
  }
}

async function updateUploadedRecord(record: MediaRecord, displayName: string, comment: string, tags: string[]) {
  return await updateMedia(record.id, {
    original_name: displayName.trim() || record.original_name,
    comment,
    tags
  })
}

function fileWithDisplayName(file: File, displayName: string) {
  const name = displayName.trim() || file.name
  if (name === file.name) return file
  return new File([file], name, { type: file.type, lastModified: file.lastModified })
}

function resetInput() {
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function extensionFor(filename: string) {
  return filename.split('.').pop() || ''
}

function resultClass(status: UploadResultStatus) {
  return {
    created: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    duplicate: 'border-sky-200 bg-sky-50 text-sky-950',
    similar: 'border-amber-200 bg-amber-50 text-amber-950',
    rejected: 'border-red-200 bg-red-50 text-red-950'
  }[status]
}

function resultIcon(status: UploadResultStatus) {
  return {
    created: 'i-lucide-check-circle',
    duplicate: 'i-lucide-info',
    similar: 'i-lucide-alert-circle',
    rejected: 'i-lucide-x-circle'
  }[status]
}

function resultText(result: UploadFileResult) {
  if (result.status === 'created') return 'Uploaded successfully'
  if (result.status === 'duplicate') return 'Existing file reused'
  if (result.status === 'similar') return 'Similar image already exists'
  return result.reason || 'Upload rejected'
}
</script>
