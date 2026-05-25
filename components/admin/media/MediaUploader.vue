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
      <UButton type="button" icon="i-lucide-folder-open" size="sm" class="mt-4" @click="openFileDialog">
        Select files
      </UButton>
      <input ref="fileInput" type="file" multiple class="sr-only" @change="handleFileSelect">
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

      <div class="overflow-x-auto rounded-lg border border-stone-200">
        <table class="min-w-full table-fixed divide-y divide-stone-200 text-sm">
          <colgroup>
            <col class="w-20">
            <col class="w-44">
            <col class="w-36">
            <col class="w-64">
            <col class="w-56">
            <col class="w-36">
            <col class="w-20">
          </colgroup>
          <thead class="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th class="px-3 py-2 text-left">Preview</th>
              <th class="px-3 py-2 text-left">File</th>
              <th class="px-3 py-2 text-left">Name</th>
              <th class="px-3 py-2 text-left">Comment override</th>
              <th class="px-3 py-2 text-left">Tag override</th>
              <th class="px-3 py-2 text-left">Progress</th>
              <th class="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-200 bg-white">
            <tr v-for="item in items" :key="item.id" class="align-top">
              <td class="px-3 py-2">
                <div class="flex size-14 items-center justify-center overflow-hidden rounded border border-stone-200 bg-stone-100">
                  <img v-if="item.previewUrl" :src="item.previewUrl" :alt="item.file.name" class="h-full w-full object-cover">
                  <UIcon v-else :name="getFileIcon(extensionFor(item.file.name), item.file.type)" class="size-6 text-stone-500" />
                </div>
              </td>
              <td class="px-3 py-2">
                <div class="min-w-0">
                  <div class="truncate font-medium text-stone-900">{{ item.file.name }}</div>
                  <div class="text-xs text-stone-500">{{ formatFileSize(item.file.size) }}</div>
                </div>
              </td>
              <td class="px-3 py-2">
                <UInput v-model="item.displayName" size="sm" />
              </td>
              <td class="px-3 py-2">
                <UTextarea v-model="item.comment" :rows="2" class="min-w-56" />
              </td>
              <td class="px-3 py-2">
                <div class="rounded-md border border-stone-300 px-2 py-1.5">
                  <MediaTagInput v-model="item.tags" />
                </div>
              </td>
              <td class="px-3 py-2">
                <div class="w-28 space-y-1">
                  <div class="text-xs text-stone-500">{{ uploading ? `${item.progress}%` : 'Waiting' }}</div>
                  <div class="h-1 w-full overflow-hidden rounded bg-stone-200">
                    <div class="h-full rounded bg-teal-500 transition-[width] duration-150" :style="{ width: `${uploading ? item.progress : 0}%` }" />
                  </div>
                </div>
              </td>
              <td class="px-3 py-2 text-right">
                <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" :disabled="uploading" @click="removeItem(item.id)" />
              </td>
            </tr>
          </tbody>
        </table>
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
        <img
          v-if="(result.record || result.similar_to)?.is_image && ((result.record || result.similar_to)?.thumbnail_url || (result.record || result.similar_to)?.url)"
          :src="(result.record || result.similar_to)?.thumbnail_url || (result.record || result.similar_to)?.url"
          alt="preview"
          class="size-10 rounded border border-white/40 object-cover"
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
  previewUrl: string | null
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

function openFileDialog() {
  const input = fileInput.value
  if (!input) return

  // showPicker is the most reliable way in Chromium-based browsers.
  const maybePicker = input as HTMLInputElement & { showPicker?: () => void }
  if (typeof maybePicker.showPicker === 'function') {
    try {
      maybePicker.showPicker()
      return
    } catch {
      // Fall back to click when showPicker is unsupported or blocked.
    }
  }

  input.click()
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
      progress: 0,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
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
  const target = items.value.find((item) => item.id === id)
  if (target?.previewUrl) {
    URL.revokeObjectURL(target.previewUrl)
  }
  items.value = items.value.filter((item) => item.id !== id)
}

function clearQueue() {
  for (const item of items.value) {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl)
    }
  }
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

    clearQueue()
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

onBeforeUnmount(() => {
  clearQueue()
})
</script>
