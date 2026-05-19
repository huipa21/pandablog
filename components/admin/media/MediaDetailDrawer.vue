<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open && file" class="fixed inset-0 z-50 flex">
        <!-- Overlay -->
        <div class="absolute inset-0 bg-black/50" @click="$emit('close')" />

        <!-- Slide panel -->
        <div class="relative ml-auto w-full max-w-lg bg-white shadow-lg">
          <div class="flex flex-col gap-4 overflow-y-auto p-4 sm:p-6 h-full">
            <!-- Header -->
            <div class="flex items-start justify-between">
              <h2 class="text-lg font-semibold text-stone-900">{{ file.original_name }}</h2>
              <UButton
                icon="i-lucide-x"
                color="primary"
                variant="ghost"
                size="sm"
                @click="$emit('close')"
              />
            </div>

            <!-- Preview -->
            <div v-if="isImage" class="rounded-lg bg-stone-100 p-4">
              <NuxtImg
                :src="file.url"
                :alt="file.original_name"
                class="max-h-64 w-full object-contain"
              />
            </div>

            <!-- Metadata -->
            <div class="space-y-3 rounded-lg bg-stone-50 p-4">
              <div class="flex justify-between text-sm">
                <span class="text-stone-600">Type</span>
                <span class="font-medium text-stone-900">{{ file.extension.toUpperCase() }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-stone-600">Size</span>
                <span class="font-medium text-stone-900">{{ formatFileSize(file.size) }}</span>
              </div>
              <template v-if="file.width && file.height">
                <div class="flex justify-between text-sm">
                  <span class="text-stone-600">Dimensions</span>
                  <span class="font-medium text-stone-900">{{ file.width }} × {{ file.height }}px</span>
                </div>
              </template>
              <div class="flex justify-between text-sm">
                <span class="text-stone-600">Upload Date</span>
                <span class="font-medium text-stone-900">{{ formatDate(file.created_at) }}</span>
              </div>
            </div>

            <!-- URL -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-stone-700">Public URL</label>
              <div class="flex items-center gap-2">
                <UInput
                  :model-value="getFileUrl(file.id)"
                  readonly
                  size="sm"
                  class="flex-1"
                />
                <UButton
                  icon="i-lucide-copy"
                  color="primary"
                  variant="soft"
                  size="sm"
                  @click="copyUrl"
                >
                  Copy
                </UButton>
              </div>
            </div>

            <!-- Actions -->
            <div class="space-y-2 border-t border-stone-200 pt-4 mt-auto">
              <UButton
                icon="i-lucide-download"
                color="primary"
                variant="soft"
                class="w-full"
                @click="downloadFile"
              >
                Download
              </UButton>
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="soft"
                class="w-full"
                :loading="deleting"
                @click="handleDelete"
              >
                Delete
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MediaRecord } from '~/types/content'

const props = defineProps<{
  file: MediaRecord | null
  open: boolean
}>()

const emit = defineEmits<{
  'close': []
  'deleted': []
}>()

const deleting = ref(false)

const { formatFileSize, getFileType, getFileUrl, deleteMedia } = useMedia()

const isImage = computed(() => props.file ? getFileType(props.file.extension) === 'image' : false)

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function copyUrl() {
  if (props.file) {
    const url = getFileUrl(props.file.id)
    navigator.clipboard.writeText(url)
  }
}

function downloadFile() {
  if (props.file) {
    const a = document.createElement('a')
    a.href = getFileUrl(props.file.id)
    a.download = props.file.original_name
    a.click()
  }
}

async function handleDelete() {
  if (!props.file) return

  const confirmed = await new Promise((resolve) => {
    const confirm = window.confirm(`Delete "${props.file!.original_name}"?`)
    resolve(confirm)
  })

  if (!confirmed) return

  deleting.value = true
  try {
    await deleteMedia(props.file.id)
    emit('deleted')
    emit('close')
  } catch (error) {
    console.error('Failed to delete media:', error)
    alert('Failed to delete file')
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
