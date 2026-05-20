<template>
  <Teleport to="body">
    <Transition name="media-panel">
      <div v-if="file" class="fixed inset-0 z-50 flex">
        <button type="button" class="absolute inset-0 bg-black/40" aria-label="Close" @click="emit('close')" />
        <aside class="relative ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
          <header class="flex items-start justify-between gap-3 border-b border-stone-200 p-4">
            <div class="min-w-0">
              <h2 class="truncate text-lg font-semibold text-stone-950">{{ file.original_name }}</h2>
              <p class="truncate text-xs text-stone-500">{{ file.hash }}</p>
            </div>
            <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" @click="emit('close')" />
          </header>

          <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            <div class="rounded-lg bg-stone-100 p-3">
              <img v-if="file.is_image" :src="file.url" :alt="file.original_name" class="max-h-80 w-full object-contain">
              <div v-else class="flex h-44 items-center justify-center">
                <UIcon :name="getFileIcon(file.extension, file.mime_type)" class="size-12 text-stone-500" />
              </div>
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
              <div v-if="file.image_meta?.format">
                <div class="text-xs text-stone-500">Image format</div>
                <div class="font-medium text-stone-900">{{ file.image_meta.format }}</div>
              </div>
            </div>

            <div class="space-y-3">
              <UFormField label="URL">
                <div class="flex gap-2">
                  <UInput :model-value="file.url" readonly class="flex-1" />
                  <UButton type="button" icon="i-lucide-copy" color="neutral" variant="soft" @click="copyUrl" />
                </div>
              </UFormField>

              <UFormField label="Comment">
                <UTextarea v-model="comment" :rows="4" />
              </UFormField>

              <UFormField label="Tags">
                <UInput v-model="tagsText" icon="i-lucide-tags" placeholder="comma separated" />
              </UFormField>

              <div class="space-y-2">
                <div class="text-sm font-medium text-stone-700">Folders</div>
                <label v-for="folder in folders" :key="folder.id" class="flex items-center gap-2 text-sm text-stone-700">
                  <input v-model="selectedFolders" type="checkbox" :value="folder.id" class="rounded border-stone-300">
                  <span>{{ folder.name }}</span>
                </label>
                <p v-if="!folders.length" class="text-sm text-stone-500">No custom folders</p>
              </div>
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
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { MediaFolderRecord, MediaRecord } from '~/types/content'

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
const comment = ref('')
const tagsText = ref('')
const selectedFolders = ref<string[]>([])
const saving = ref(false)
const deleting = ref(false)

watch(() => props.file, (file) => {
  comment.value = file?.comment || ''
  tagsText.value = (file?.tags || []).join(', ')
  selectedFolders.value = [...(file?.folders || [])]
}, { immediate: true })

async function save() {
  if (!props.file) return
  saving.value = true
  try {
    const updated = await updateMedia(props.file.id, {
      comment: comment.value,
      tags: tagsText.value.split(',').map((tag) => tag.trim()).filter(Boolean),
      folders: selectedFolders.value
    })
    emit('updated', updated)
  } finally {
    saving.value = false
  }
}

async function deleteFile() {
  if (!props.file) return
  const message = (props.file.reference_count || 0) > 0
    ? `Delete "${props.file.original_name}"? It is referenced ${props.file.reference_count} time(s) and may break content.`
    : `Delete "${props.file.original_name}"?`

  if (!window.confirm(message)) return

  deleting.value = true
  try {
    await deleteMedia(props.file.id, false)
    emit('deleted', props.file)
  } catch (error: any) {
    window.alert(error?.statusMessage || error?.message || 'Delete failed')
  } finally {
    deleting.value = false
  }
}

function copyUrl() {
  if (props.file) {
    void navigator.clipboard.writeText(props.file.url)
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
