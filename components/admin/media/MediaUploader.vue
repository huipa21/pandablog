<template>
  <div class="space-y-4">
    <!-- Drag & drop zone -->
    <div
      @drop.prevent="handleDrop"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      :class="[
        'relative rounded-lg border-2 border-dashed p-8 text-center transition-colors',
        isDragging
          ? 'border-primary-500 bg-primary-50'
          : 'border-stone-300 hover:border-stone-400'
      ]"
    >
      <UIcon name="i-lucide-cloud-upload" class="mx-auto mb-2 size-8 text-stone-400" />
      <p class="text-sm font-medium text-stone-700">Drag files here or click to select</p>
      <p class="text-xs text-stone-500">Max {{ mediaConfig.getMaxFileSizeDisplay() }} per file, {{ mediaConfig.getMaxFilesPerUpload() }} files at a time</p>
      <input
        ref="fileInput"
        type="file"
        multiple
        class="hidden"
        @change="handleFileSelect"
      >
      <button
        type="button"
        class="mt-3 text-sm text-primary-600 hover:text-primary-700 underline"
        @click="fileInput?.click()"
      >
        or select from computer
      </button>
    </div>

    <!-- File list with progress -->
    <div v-if="uploadingFiles.length > 0" class="space-y-3 rounded-lg bg-stone-50 p-4">
      <div
        v-for="(file, index) in uploadingFiles"
        :key="`${file.name}-${index}`"
        class="space-y-1"
      >
        <div class="flex items-center justify-between text-sm">
          <div class="flex items-center gap-2 min-w-0">
            <UIcon :name="getFileIcon(file.name)" class="size-4 flex-shrink-0 text-stone-500" />
            <span class="truncate text-stone-700">{{ file.name }}</span>
            <span class="text-xs text-stone-500 flex-shrink-0">{{ formatFileSize(file.size) }}</span>
          </div>
          <div v-if="fileProgress[index] !== undefined" class="text-xs text-stone-600">
            {{ fileProgress[index] }}%
          </div>
        </div>
        <UProgress :value="fileProgress[index] || 0" class="h-1" />
      </div>
    </div>

    <!-- Results -->
    <div v-if="uploadResults.length > 0" class="space-y-2">
      <div
        v-for="(result, index) in uploadResults"
        :key="`result-${index}`"
        :class="[
          'flex items-start gap-3 rounded-lg p-3 text-sm',
          result.status === 'created'
            ? 'bg-green-50 text-green-900'
            : result.status === 'duplicate'
            ? 'bg-blue-50 text-blue-900'
            : result.status === 'similar'
            ? 'bg-yellow-50 text-yellow-900'
            : 'bg-red-50 text-red-900'
        ]"
      >
        <UIcon
          :name="
            result.status === 'created'
              ? 'i-lucide-check-circle'
              : result.status === 'duplicate'
              ? 'i-lucide-info'
              : result.status === 'similar'
              ? 'i-lucide-alert-circle'
              : 'i-lucide-x-circle'
          "
          class="mt-0.5 size-5 flex-shrink-0"
        />
        <div class="flex-1 min-w-0">
          <div class="font-medium">{{ result.original_name }}</div>
          <div class="text-xs opacity-75">
            <template v-if="result.status === 'created'">✅ Uploaded successfully</template>
            <template v-else-if="result.status === 'duplicate'">ℹ️ Already exists</template>
            <template v-else-if="result.status === 'similar'">⚠️ Similar image already exists</template>
            <template v-else>❌ {{ result.reason }}</template>
          </div>
          <div v-if="result.similar_to" class="mt-1 text-xs">
            <button
              type="button"
              class="underline hover:opacity-75"
              @click="$emit('view-media', result.similar_to!.id)"
            >
              View existing ({{ result.similar_to!.original_name }})
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UploadFileResult } from '~/types/content'

const emit = defineEmits<{
  'upload-complete': [results: UploadFileResult[]]
  'view-media': [id: string]
}>()

const fileInput = ref<HTMLInputElement>()
const isDragging = ref(false)
const uploadingFiles = ref<File[]>([])
const fileProgress = ref<Record<number, number>>({})
const uploadResults = ref<UploadFileResult[]>([])

const { uploadFiles, formatFileSize, getFileIcon } = useMedia()
const mediaConfig = useMediaConfig()

async function handleDrop(event: DragEvent) {
  isDragging.value = false
  const files = event.dataTransfer?.files
  if (files) {
    await processFiles(Array.from(files))
  }
}

function handleFileSelect(event: Event) {
  const files = (event.target as HTMLInputElement).files
  if (files) {
    processFiles(Array.from(files))
  }
}

async function processFiles(files: File[]) {
  // Client-side validation
  const validFiles: File[] = []
  for (const file of files) {
    const validation = mediaConfig.validateFileBeforeUpload(file)
    if (!validation.valid) {
      uploadResults.value.push({
        original_name: file.name,
        status: 'rejected',
        reason: validation.reason
      })
    } else {
      validFiles.push(file)
    }
  }

  if (validFiles.length === 0) {
    return
  }

  // Check max files limit
  if (validFiles.length > mediaConfig.getMaxFilesPerUpload()) {
    uploadResults.value.push({
      status: 'rejected',
      reason: `Maximum ${mediaConfig.getMaxFilesPerUpload()} files per upload allowed`
    })
    return
  }

  uploadingFiles.value = validFiles
  fileProgress.value = {}

  try {
    const response = await uploadFiles(validFiles, (file, progress) => {
      const index = validFiles.indexOf(file)
      if (index >= 0) {
        fileProgress.value[index] = Math.round(progress)
      }
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
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  }
}
</script>
