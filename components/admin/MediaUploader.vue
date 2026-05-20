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
        Select Files
      </UButton>
      <input ref="fileInput" type="file" multiple class="hidden" @change="handleFileSelect">
    </div>

    <div v-if="uploadingFiles.length" class="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
      <div v-for="file in uploadingFiles" :key="file.name" class="space-y-1">
        <div class="flex items-center justify-between gap-3 text-sm">
          <div class="flex min-w-0 items-center gap-2">
            <UIcon :name="getFileIcon(extensionFor(file.name), file.type)" class="size-4 shrink-0 text-stone-500" />
            <span class="truncate text-stone-800">{{ file.name }}</span>
            <span class="shrink-0 text-xs text-stone-500">{{ formatFileSize(file.size) }}</span>
          </div>
          <span class="w-12 text-right text-xs text-stone-600">{{ fileProgress[file.name] || 0 }}%</span>
        </div>
        <UProgress :value="fileProgress[file.name] || 0" class="h-1" />
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
import type { UploadFileResult, UploadResultStatus } from '~/types/content'

const emit = defineEmits<{
  'upload-complete': [results: UploadFileResult[]]
  'view-media': [id: string]
}>()

const fileInput = ref<HTMLInputElement>()
const isDragging = ref(false)
const uploadingFiles = ref<File[]>([])
const fileProgress = ref<Record<string, number>>({})
const uploadResults = ref<UploadFileResult[]>([])

const { uploadFiles, formatFileSize, getFileIcon } = useMedia()
const mediaConfig = useMediaConfig()

async function handleDrop(event: DragEvent) {
  isDragging.value = false
  await processFiles(Array.from(event.dataTransfer?.files ?? []))
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  void processFiles(Array.from(input.files ?? []))
}

async function processFiles(files: File[]) {
  uploadResults.value = []
  const validFiles: File[] = []

  for (const file of files) {
    const validation = mediaConfig.validateFileBeforeUpload(file)
    if (validation.valid) {
      validFiles.push(file)
    } else {
      uploadResults.value.push({
        original_name: file.name,
        status: 'rejected',
        reason: validation.reason
      })
    }
  }

  if (!validFiles.length) {
    resetInput()
    return
  }

  if (validFiles.length > mediaConfig.getMaxFilesPerUpload()) {
    uploadResults.value.push({
      status: 'rejected',
      reason: `Maximum ${mediaConfig.getMaxFilesPerUpload()} files per upload allowed`
    })
    resetInput()
    return
  }

  uploadingFiles.value = validFiles
  fileProgress.value = Object.fromEntries(validFiles.map((file) => [file.name, 0]))

  try {
    const response = await uploadFiles(validFiles, (file, progress) => {
      fileProgress.value[file.name] = progress
    })
    uploadResults.value.push(...response.results)
    emit('upload-complete', response.results)
  } catch (error) {
    uploadResults.value.push({
      status: 'rejected',
      reason: error instanceof Error ? error.message : 'Upload failed'
    })
  } finally {
    uploadingFiles.value = []
    fileProgress.value = {}
    resetInput()
  }
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
