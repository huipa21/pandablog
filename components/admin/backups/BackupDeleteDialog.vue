<template>
  <UModal :open="open" @update:open="$emit('update:open', $event)">
    <template #content>
      <div class="p-5">
        <h2 class="text-xl font-semibold text-[var(--pb-text)]">{{ t('admin.backups.deleteDialog.title') }}</h2>
        <p class="mt-2 text-sm text-[var(--pb-text-muted)]">
          {{ t('admin.backups.deleteDialog.description', { id: snapshotId }) }}
        </p>

        <UAlert v-if="error" color="error" class="mt-4" :description="error" />

        <div class="mt-5 flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="submitting" @click="$emit('update:open', false)">
            {{ t('admin.common.cancel') }}
          </UButton>
          <UButton
            color="error"
            :loading="submitting"
            :disabled="submitting"
            @click="submit"
          >
            {{ submitting ? t('admin.backups.deleteDialog.deleting') : t('admin.backups.deleteDialog.delete') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  open: boolean
  snapshotId: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'deleted': []
}>()

const { t } = useI18n()
const submitting = ref(false)
const error = ref<string | null>(null)

watch(() => props.open, (val) => {
  if (!val) {
    error.value = null
  }
})

async function submit() {
  if (submitting.value) return
  error.value = null
  submitting.value = true
  try {
    await $fetch(`/api/admin/backups/${props.snapshotId}`, {
      method: 'DELETE',
      body: {
        confirm_token: `DELETE_${props.snapshotId}`,
      },
    })
    emit('deleted')
    emit('update:open', false)
  } catch (err: any) {
    error.value = err?.data?.message ?? err?.message ?? t('admin.backups.deleteDialog.deleteFailed')
  } finally {
    submitting.value = false
  }
}
</script>
