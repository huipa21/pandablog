<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/40" @click="emit('close')" />
      <div class="relative w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 class="mb-4 text-lg font-semibold text-stone-950">{{ folder ? 'Edit Smart Folder' : 'Create Smart Folder' }}</h2>

        <form class="space-y-4" @submit.prevent="save">
          <UFormField label="Name">
            <UInput v-model="form.name" placeholder="e.g. All Images, Orphaned PDFs" required />
          </UFormField>

          <UFormField label="File type">
            <USelect v-model="form.file_type" :items="typeItems" />
          </UFormField>

          <UFormField label="Tags">
            <div class="rounded-md border border-stone-300 px-2 py-1.5">
              <MediaTagInput v-model="form.tags" />
            </div>
          </UFormField>

          <UFormField label="Filename contains (regex)">
            <UInput v-model="form.filename_regex" placeholder="e.g. screenshot|photo" />
          </UFormField>

          <label class="flex items-center gap-2 text-sm text-stone-700">
            <input v-model="form.filename_regex_case_insensitive" type="checkbox" class="rounded border-stone-300">
            <span>Case insensitive regex</span>
          </label>

          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Date from">
              <UInput v-model="form.date_from" type="date" />
            </UFormField>
            <UFormField label="Date to">
              <UInput v-model="form.date_to" type="date" />
            </UFormField>
          </div>

          <label class="flex items-center gap-2 text-sm text-stone-700">
            <input v-model="form.orphan_only" type="checkbox" class="rounded border-stone-300">
            <span>Orphans only (no references)</span>
          </label>

          <div class="flex justify-end gap-2 pt-2">
            <UButton type="button" color="neutral" variant="ghost" @click="emit('close')">Cancel</UButton>
            <UButton type="submit" :loading="saving">{{ folder ? 'Save' : 'Create' }}</UButton>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import MediaTagInput from '~/components/admin/media/MediaTagInput.vue'

interface SmartFolder {
  id: string
  name: string
  filters: {
    tags?: string[]
    filename_regex?: string
    filename_regex_case_insensitive?: boolean
    file_type?: string
    date_from?: string
    date_to?: string
    orphan_only?: boolean
  }
}

const props = defineProps<{
  folder: SmartFolder | null
}>()

const emit = defineEmits<{
  'close': []
  'saved': []
}>()

const saving = ref(false)

const form = reactive({
  name: props.folder?.name || '',
  file_type: props.folder?.filters.file_type || 'all',
  tags: [...(props.folder?.filters.tags || [])],
  filename_regex: props.folder?.filters.filename_regex || '',
  filename_regex_case_insensitive: props.folder?.filters.filename_regex_case_insensitive || false,
  date_from: props.folder?.filters.date_from || '',
  date_to: props.folder?.filters.date_to || '',
  orphan_only: props.folder?.filters.orphan_only || false
})

const typeItems = [
  { label: 'All files', value: 'all' },
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' },
  { label: 'Documents', value: 'document' },
  { label: 'Archives', value: 'archive' },
  { label: 'Other', value: 'other' }
]

async function save() {
  saving.value = true
  try {
    const body = {
      name: form.name,
      filters: {
        tags: form.tags,
        filename_regex: form.filename_regex || undefined,
        filename_regex_case_insensitive: form.filename_regex_case_insensitive || undefined,
        file_type: form.file_type === 'all' ? undefined : form.file_type,
        date_from: form.date_from || undefined,
        date_to: form.date_to || undefined,
        orphan_only: form.orphan_only || undefined
      }
    }

    if (props.folder) {
      await $fetch(`/api/media/smart-folders/${props.folder.id}`, { method: 'PATCH', body })
    } else {
      await $fetch('/api/media/smart-folders', { method: 'POST', body })
    }
    emit('saved')
  } finally {
    saving.value = false
  }
}
</script>
