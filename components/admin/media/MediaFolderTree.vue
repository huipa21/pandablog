<template>
  <aside class="space-y-4 rounded-lg border border-stone-200 bg-white p-3">
    <div class="space-y-1">
      <button type="button" class="folder-row" :class="activeClass(mode === 'all')" @click="emit('select-all')">
        <UIcon name="i-lucide-library" class="size-4" />
        <span>All files</span>
      </button>
      <button type="button" class="folder-row" :class="activeClass(mode === 'tag')" @click="emit('select-tags-view')">
        <UIcon name="i-lucide-tags" class="size-4" />
        <span>Tags</span>
      </button>
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wide text-stone-500">
        <span>Folders</span>
        <UButton type="button" icon="i-lucide-plus" size="xs" variant="ghost" color="neutral" @click="createFolder" />
      </div>
      <div class="space-y-1">
        <div
          v-for="folder in sortedFolders"
          :key="folder.id"
          class="group flex items-center gap-1 rounded-md"
          @dragover.prevent
          @drop.prevent="dropOnFolder($event, folder.id)"
        >
          <button type="button" class="folder-row flex-1" :class="activeClass(selectedFolder === folder.id)" @click="emit('select-folder', folder.id)">
            <UIcon :name="folder.slug === 'default' ? 'i-lucide-inbox' : 'i-lucide-folder'" class="size-4" />
            <span class="truncate">{{ folder.name }}</span>
          </button>
          <UDropdownMenu v-if="folder.slug !== 'default'" :items="folderMenu(folder)">
            <UButton type="button" icon="i-lucide-ellipsis" size="xs" variant="ghost" color="neutral" class="opacity-0 group-hover:opacity-100" />
          </UDropdownMenu>
        </div>
        <p v-if="!folders.length" class="px-2 text-xs text-stone-500">No folders</p>
      </div>
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wide text-stone-500">
        <span>Smart folders</span>
        <UButton type="button" icon="i-lucide-plus" size="xs" variant="ghost" color="neutral" @click="emit('create-smart-folder')" />
      </div>
      <div class="space-y-1">
        <div
          v-for="sf in smartFolders"
          :key="sf.id"
          class="group flex items-center gap-1 rounded-md"
        >
          <button type="button" class="folder-row flex-1" :class="activeClass(selectedSmartFolder === sf.id)" @click="emit('select-smart-folder', sf.id)">
            <UIcon name="i-lucide-sparkles" class="size-4" />
            <span class="truncate">{{ sf.name }}</span>
          </button>
          <UDropdownMenu :items="smartFolderMenu(sf)">
            <UButton type="button" icon="i-lucide-ellipsis" size="xs" variant="ghost" color="neutral" class="opacity-0 group-hover:opacity-100" />
          </UDropdownMenu>
        </div>
        <p v-if="!smartFolders.length" class="px-2 text-xs text-stone-500">No smart folders</p>
      </div>
    </div>
  </aside>

  <AdminConfirmActionDialog
    :open="deleteFolderDialogOpen"
    title="Delete folder?"
    :description="deleteFolderDialogDescription"
    confirm-label="Delete"
    confirm-color="error"
    @update:open="(value) => { if (!value) closeDeleteFolderDialog() }"
    @cancel="closeDeleteFolderDialog"
    @confirm="confirmDeleteFolder"
  />
</template>

<script setup lang="ts">
import type { MediaFolderRecord, MediaTagSummary } from '~/types/content'

interface SmartFolder {
  id: string
  name: string
  filters: Record<string, unknown>
}

const props = defineProps<{
  folders: MediaFolderRecord[]
  mediaTags: MediaTagSummary[]
  smartFolders: SmartFolder[]
  selectedFolder?: string
  selectedSmartFolder?: string
  selectedTag?: string
  mode: 'all' | 'folder' | 'smart' | 'tag'
}>()

const emit = defineEmits<{
  'select-all': []
  'select-folder': [id: string]
  'select-tags-view': []
  'select-smart-folder': [id: string]
  'create-folder': []
  'rename-folder': [id: string, name: string]
  'delete-folder': [id: string]
  'assign-file': [hash: string, folderId: string]
  'create-smart-folder': []
  'edit-smart-folder': [folder: SmartFolder]
  'delete-smart-folder': [id: string]
}>()

const sortedFolders = computed(() => {
  const defaultFolder = props.folders.filter((f) => f.slug === 'default')
  const otherFolders = props.folders.filter((f) => f.slug !== 'default')
  return [...defaultFolder, ...otherFolders]
})
const deleteFolderDialogOpen = ref(false)
const pendingDeleteFolder = ref<MediaFolderRecord | null>(null)
const deleteFolderDialogDescription = computed(() => pendingDeleteFolder.value
  ? `Delete folder "${pendingDeleteFolder.value.name}"? Files will stay in the library.`
  : 'Delete this folder?')

function activeClass(active: boolean) {
  return active ? 'bg-teal-50 text-teal-800' : 'text-stone-700 hover:bg-stone-50'
}

function createFolder() {
  emit('create-folder')
}

function folderMenu(folder: MediaFolderRecord) {
  return [[
    {
      label: 'Rename',
      icon: 'i-lucide-pencil',
      onSelect: () => {
        const name = window.prompt('Folder name', folder.name)?.trim()
        if (name) emit('rename-folder', folder.id, name)
      }
    },
    {
      label: 'Delete',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => openDeleteFolderDialog(folder)
    }
  ]]
}

function openDeleteFolderDialog(folder: MediaFolderRecord) {
  pendingDeleteFolder.value = folder
  deleteFolderDialogOpen.value = true
}

function closeDeleteFolderDialog() {
  deleteFolderDialogOpen.value = false
  pendingDeleteFolder.value = null
}

function confirmDeleteFolder() {
  const folder = pendingDeleteFolder.value
  if (!folder) {
    closeDeleteFolderDialog()
    return
  }

  emit('delete-folder', folder.id)
  closeDeleteFolderDialog()
}

function smartFolderMenu(sf: SmartFolder) {
  return [[
    {
      label: 'Edit',
      icon: 'i-lucide-pencil',
      onSelect: () => emit('edit-smart-folder', sf)
    },
    {
      label: 'Delete',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => emit('delete-smart-folder', sf.id)
    }
  ]]
}

function dropOnFolder(event: DragEvent, folderId: string) {
  const hash = event.dataTransfer?.getData('application/x-pandablog-media-hash') || event.dataTransfer?.getData('text/plain')
  if (hash) emit('assign-file', hash, folderId)
}
</script>

<style scoped>
.folder-row {
  display: flex;
  min-width: 0;
  width: 100%;
  align-items: center;
  gap: 0.5rem;
  border-radius: 0.375rem;
  padding: 0.5rem;
  text-align: left;
  font-size: 0.875rem;
}
</style>
