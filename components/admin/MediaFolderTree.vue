<template>
  <aside class="space-y-4 rounded-lg border border-stone-200 bg-white p-3">
    <div class="space-y-1">
      <button type="button" class="folder-row" :class="activeClass(mode === 'all')" @click="emit('select-all')">
        <UIcon name="i-lucide-library" class="size-4" />
        <span>All files</span>
      </button>
      <button type="button" class="folder-row" :class="activeClass(mode === 'orphans')" @click="emit('select-orphans')">
        <UIcon name="i-lucide-unlink" class="size-4" />
        <span>Orphans</span>
      </button>
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wide text-stone-500">
        <span>Custom folders</span>
        <UButton type="button" icon="i-lucide-plus" size="xs" variant="ghost" color="neutral" @click="createFolder" />
      </div>
      <div class="space-y-1">
        <div
          v-for="folder in folders"
          :key="folder.id"
          class="group flex items-center gap-1 rounded-md"
          @dragover.prevent
          @drop.prevent="dropOnFolder($event, folder.id)"
        >
          <button type="button" class="folder-row flex-1" :class="activeClass(selectedFolder === folder.id)" @click="emit('select-folder', folder.id)">
            <UIcon name="i-lucide-folder" class="size-4" />
            <span class="truncate">{{ folder.name }}</span>
          </button>
          <UDropdownMenu :items="folderMenu(folder)">
            <UButton type="button" icon="i-lucide-ellipsis" size="xs" variant="ghost" color="neutral" class="opacity-0 group-hover:opacity-100" />
          </UDropdownMenu>
        </div>
        <p v-if="!folders.length" class="px-2 text-xs text-stone-500">No custom folders</p>
      </div>
    </div>

    <div class="space-y-2">
      <div class="px-1 text-xs font-medium uppercase tracking-wide text-stone-500">Month folders</div>
      <div class="space-y-1">
        <button
          v-for="month in monthFolders"
          :key="month.value"
          type="button"
          class="folder-row"
          :class="activeClass(selectedMonth === month.value)"
          @click="emit('select-month', month.value)"
        >
          <UIcon name="i-lucide-calendar" class="size-4" />
          <span>{{ month.label }}</span>
        </button>
        <p v-if="!monthFolders.length" class="px-2 text-xs text-stone-500">No uploaded months</p>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { MediaFolderRecord } from '~/types/content'

interface MediaMonthFolder {
  label: string
  value: string
}

const props = defineProps<{
  folders: MediaFolderRecord[]
  monthFolders: MediaMonthFolder[]
  selectedFolder?: string
  selectedMonth?: string
  mode: 'all' | 'folder' | 'month' | 'orphans'
}>()

const emit = defineEmits<{
  'select-all': []
  'select-orphans': []
  'select-folder': [id: string]
  'select-month': [month: string]
  'create-folder': [name: string]
  'rename-folder': [id: string, name: string]
  'delete-folder': [id: string]
  'assign-file': [hash: string, folderId: string]
}>()

function activeClass(active: boolean) {
  return active ? 'bg-teal-50 text-teal-800' : 'text-stone-700 hover:bg-stone-50'
}

function createFolder() {
  const name = window.prompt('Folder name')?.trim()
  if (name) emit('create-folder', name)
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
      onSelect: () => {
        if (window.confirm(`Delete folder "${folder.name}"? Files will stay in the library.`)) {
          emit('delete-folder', folder.id)
        }
      }
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
