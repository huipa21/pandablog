<template>
  <UModal :open="open" @update:open="$emit('update:open', $event)">
    <template #content>
      <div class="p-5">
        <h2 class="text-xl font-semibold text-[var(--pb-text)]">{{ t('admin.backups.deleteDialog.title') }}</h2>
        <p class="mt-2 text-sm text-[var(--pb-text-muted)]">
          {{ t('admin.backups.deleteDialog.description', { id: snapshotId, count: descendantCount }) }}
        </p>

        <label v-if="descendantCount > 0" class="mt-4 flex cursor-pointer items-start gap-2">
          <UCheckbox v-model="cascade" />
          <span class="text-sm text-[var(--pb-text)]">
            {{ t('admin.backups.deleteDialog.cascadeLabel', { count: descendantCount }) }}
          </span>
        </label>

        <UAlert v-if="error" color="error" class="mt-4" :description="error" />

        <div class="mt-5 flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="submitting" @click="$emit('update:open', false)">
            {{ t('admin.common.cancel') }}
          </UButton>
          <UButton
            color="error"
            :loading="submitting"
            :disabled="descendantCount > 0 && !cascade"
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
  descendantCount: number
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'deleted': []
}>()

const { t } = useI18n()
const submitting = ref(false)
const cascade = ref(false)
const error = ref<string | null>(null)

watch(() => props.open, (val) => {
  if (!val) {
    cascade.value = false
    error.value = null
  }
})

async function submit() {
  error.value = null
  submitting.value = true
  try {
    await $fetch(`/api/admin/backups/${props.snapshotId}`, {
      method: 'DELETE',
      body: {
        confirm_token: `DELETE_${props.snapshotId}`,
        cascade: cascade.value,
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
