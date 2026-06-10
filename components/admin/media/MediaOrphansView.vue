<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950 md:flex-row md:items-center md:justify-between">
      <div>
        <div class="font-medium">{{ t('admin.media.orphanCount', { count: files.length }) }}</div>
        <div class="text-sm opacity-80">{{ t('admin.media.orphansDescription') }}</div>
      </div>
      <UButton type="button" icon="i-lucide-trash-2" color="error" variant="soft" :disabled="!files.length" :loading="cleaning" @click="cleanup">
        {{ t('admin.media.deleteOrphans') }}
      </UButton>
    </div>

    <MediaGrid :files="files" :page="1" :pages="1" @select="emit('select', $event)" />

    <AdminConfirmActionDialog
      :open="cleanupDialogOpen"
      :title="t('admin.media.deleteOrphansTitle')"
      :description="cleanupDialogDescription"
      :confirm-label="t('admin.media.deleteOrphans')"
      confirm-color="error"
      :loading="cleaning"
      @update:open="(value) => { if (!value) closeCleanupDialog() }"
      @cancel="closeCleanupDialog"
      @confirm="confirmCleanup"
    />
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

const { t } = useI18n()
const { cleanupOrphans } = useMedia()
const cleaning = ref(false)
const cleanupDialogOpen = ref(false)
const cleanupDialogDescription = computed(() => t('admin.media.deleteOrphansDescription', { count: props.files.length }))

async function cleanup() {
  if (!props.files.length) return
  cleanupDialogOpen.value = true
}

function closeCleanupDialog() {
  if (cleaning.value) {
    return
  }

  cleanupDialogOpen.value = false
}

async function confirmCleanup() {
  if (!props.files.length) {
    closeCleanupDialog()
    return
  }

  cleaning.value = true
  try {
    await cleanupOrphans({ hashes: props.files.map((file) => file.hash) })
    closeCleanupDialog()
    emit('cleanup-complete')
  } finally {
    cleaning.value = false
  }
}
</script>
