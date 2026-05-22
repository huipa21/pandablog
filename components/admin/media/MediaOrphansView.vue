<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950 md:flex-row md:items-center md:justify-between">
      <div>
        <div class="font-medium">{{ files.length }} orphan file<template v-if="files.length !== 1">s</template></div>
        <div class="text-sm opacity-80">Files with no tracked references.</div>
      </div>
      <UButton type="button" icon="i-lucide-trash-2" color="error" variant="soft" :disabled="!files.length" :loading="cleaning" @click="cleanup">
        Delete Orphans
      </UButton>
    </div>

    <MediaGrid :files="files" :page="1" :pages="1" @select="emit('select', $event)" />
  </div>
</template>

<script setup lang="ts">
import type { MediaRecord } from '~/types/content'
import MediaGrid from '~/components/admin/media/MediaGrid.vue'

const props = defineProps<{
  files: MediaRecord[]
}>()

const emit = defineEmits<{
  'select': [file: MediaRecord]
  'cleanup-complete': []
}>()

const { cleanupOrphans } = useMedia()
const cleaning = ref(false)

async function cleanup() {
  if (!props.files.length) return
  if (!window.confirm(`Delete ${props.files.length} orphan file(s)? This removes database records and physical files.`)) return

  cleaning.value = true
  try {
    await cleanupOrphans({ hashes: props.files.map((file) => file.hash) })
    emit('cleanup-complete')
  } finally {
    cleaning.value = false
  }
}
</script>
