<template>
  <Teleport to="body">
    <Transition name="media-panel">
      <div v-if="file" class="fixed inset-0 z-50 flex">
        <button type="button" class="absolute inset-0 bg-black/40" aria-label="Close" @click="emit('close')" />
        <aside class="relative ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
          <header class="flex items-start justify-between gap-3 border-b border-stone-200 p-4">
            <div class="min-w-0 flex-1">
              <UInput
                v-model="displayName"
                class="text-lg font-semibold"
                variant="none"
                :ui="{ base: 'text-lg font-semibold text-stone-950 px-0' }"
                placeholder="File name"
              />
            </div>
            <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" @click="emit('close')" />
          </header>

          <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            <div class="rounded-lg bg-stone-100 p-3">
              <img v-if="file.is_image" :src="file.url" :alt="file.original_name" class="max-h-80 w-full object-contain">
              <div v-else class="flex h-44 items-center justify-center">
                <FileIcon :filename="file.original_name || file.extension" size="48" />
              </div>
            </div>

            <div class="flex gap-2">
              <UButton
                type="button"
                icon="i-lucide-external-link"
                color="neutral"
                variant="soft"
                size="sm"
                @click="viewOriginal"
              >
                View original
              </UButton>
              <UButton
                type="button"
                icon="i-lucide-download"
                color="neutral"
                variant="soft"
                size="sm"
                @click="downloadFile"
              >
                Download
              </UButton>
            </div>

            <div class="grid grid-cols-2 gap-3 rounded-lg border border-stone-200 p-3 text-sm">
              <div>
                <div class="text-xs text-stone-500">Type</div>
                <div class="font-medium text-stone-900">{{ file.mime_type || file.extension }}</div>
              </div>
              <div>
                <div class="text-xs text-stone-500">Size</div>
                <div class="font-medium text-stone-900">{{ formatFileSize(file.size) }}</div>
              </div>
              <div v-if="file.width && file.height">
                <div class="text-xs text-stone-500">Dimensions</div>
                <div class="font-medium text-stone-900">{{ file.width }} × {{ file.height }}</div>
              </div>
              <div>
                <div class="text-xs text-stone-500">Uploaded</div>
                <div class="font-medium text-stone-900">{{ formatDate(file.uploaded_at || file.created_at) }}</div>
              </div>
              <div>
                <div class="text-xs text-stone-500">References</div>
                <div class="font-medium text-stone-900">{{ file.reference_count || 0 }}</div>
              </div>
              <div class="col-span-2">
                <div class="text-xs text-stone-500">Hash ID</div>
                <div class="break-all font-mono text-xs text-stone-900">{{ file.hash }}</div>
              </div>
              <div v-if="file.image_meta?.format">
                <div class="text-xs text-stone-500">Image format</div>
                <div class="font-medium text-stone-900">{{ file.image_meta.format }}</div>
              </div>
            </div>

            <div class="space-y-3">
              <UFormField label="Comment">
                <UTextarea v-model="comment" :rows="3" />
              </UFormField>

              <UFormField label="Tags">
                <div class="rounded-md border border-stone-300 px-2 py-1.5">
                  <MediaTagInput v-model="tags" />
                </div>
              </UFormField>
            </div>
          </div>

          <footer class="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 p-4">
            <UButton type="button" icon="i-lucide-trash-2" color="error" variant="soft" :loading="deleting" @click="deleteFile">
              Delete
            </UButton>
            <div class="flex gap-2">
              <UButton type="button" color="neutral" variant="ghost" @click="emit('close')">Cancel</UButton>
              <UButton type="button" icon="i-lucide-save" :loading="saving" @click="save">Save</UButton>
            </div>
          </footer>
        </aside>

        <AdminConfirmActionDialog
          :open="deleteDialogOpen"
          title="Delete file?"
          :description="deleteDialogDescription"
          confirm-label="Delete"
          confirm-color="error"
          :loading="deleting"
          @update:open="(value) => { if (!value) closeDeleteDialog() }"
          @cancel="closeDeleteDialog"
          @confirm="confirmDeleteFile"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { MediaFolderRecord, MediaRecord } from '~/types/content'
import MediaTagInput from '~/components/admin/media/MediaTagInput.vue'

const props = defineProps<{
  file: MediaRecord | null
  folders: MediaFolderRecord[]
}>()

const emit = defineEmits<{
  'close': []
  'updated': [file: MediaRecord]
  'deleted': [file: MediaRecord]
}>()

const { formatFileSize, getFileIcon, updateMedia, deleteMedia } = useMedia()
const displayName = ref('')
const comment = ref('')
const tags = ref<string[]>([])
const saving = ref(false)
const deleting = ref(false)
const deleteDialogOpen = ref(false)
const adminToast = useAdminToast()
const deleteDialogDescription = computed(() => {
  const file = props.file
  if (!file) {
    return 'Delete this file?'
  }

  return (file.reference_count || 0) > 0
    ? `Delete "${file.original_name}"? It is referenced ${file.reference_count} time(s) and may break content.`
    : `Delete "${file.original_name}"?`
})

watch(() => props.file, (file) => {
  displayName.value = file?.original_name || ''
  comment.value = file?.comment || ''
  tags.value = [...(file?.tags || [])]
}, { immediate: true })

function viewOriginal() {
  if (!props.file) return
  const baseUrl = window.location.origin
  const url = `${baseUrl}/media/${props.file.hash}`
  window.open(url, '_blank')
}

function downloadFile() {
  if (!props.file) return
  const link = document.createElement('a')
  link.href = `/media/${props.file.hash}?download=true`
  link.download = props.file.original_name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

async function save() {
  if (!props.file) return
  saving.value = true
  try {
    const updated = await updateMedia(props.file.id, {
      original_name: displayName.value,
      comment: comment.value,
      tags: tags.value
    })
    emit('updated', updated)
    adminToast.success('File saved')
  } catch (error: any) {
    adminToast.error(error, 'Could not save file')
  } finally {
    saving.value = false
  }
}

async function deleteFile() {
  if (!props.file) return
  deleteDialogOpen.value = true
}

function closeDeleteDialog() {
  if (deleting.value) {
    return
  }

  deleteDialogOpen.value = false
}

async function confirmDeleteFile() {
  if (!props.file) {
    closeDeleteDialog()
    return
  }

  deleting.value = true
  try {
    await deleteMedia(props.file.id, false)
    closeDeleteDialog()
    emit('deleted', props.file)
    adminToast.success('File deleted')
  } catch (error: any) {
    adminToast.error(error, 'Delete failed')
  } finally {
    deleting.value = false
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}
</script>

<style scoped>
.media-panel-enter-active,
.media-panel-leave-active {
  transition: opacity 0.18s ease;
}

.media-panel-enter-from,
.media-panel-leave-to {
  opacity: 0;
}
</style>
