<template>
  <UModal :open="open" @update:open="$emit('update:open', $event)">
    <template #content>
      <div class="p-5">
        <h2 class="text-xl font-semibold text-[var(--pb-text)]">{{ t('admin.backups.restoreDialog.title') }}</h2>

        <UAlert
          color="warning"
          icon="i-lucide-triangle-alert"
          class="mt-4"
          :description="t('admin.backups.restoreDialog.warning')"
        />

        <div class="mt-4">
          <label class="block text-sm font-medium text-[var(--pb-text)]">
            {{ t('admin.backups.restoreDialog.confirmLabel', { id: snapshotId }) }}
          </label>
          <UInput
            v-model="confirmInput"
            :placeholder="t('admin.backups.restoreDialog.confirmPlaceholder', { id: snapshotId })"
            class="mt-1 font-mono"
          />
        </div>

        <UAlert v-if="error" color="error" class="mt-4" :description="error" />

        <div class="mt-5 flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="submitting" @click="$emit('update:open', false)">
            {{ t('admin.common.cancel') }}
          </UButton>
          <UButton color="error" :loading="submitting" @click="submit">
            {{ submitting ? t('admin.backups.restoreDialog.restoring') : t('admin.backups.restoreDialog.restore') }}
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
  'restored': []
}>()

const { t } = useI18n()
const confirmInput = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

watch(() => props.open, (val) => {
  if (!val) {
    confirmInput.value = ''
    error.value = null
  }
})

async function submit() {
  error.value = null
  if (confirmInput.value !== `RESTORE_${props.snapshotId}`) {
    error.value = t('admin.backups.restoreDialog.invalidToken')
    return
  }
  submitting.value = true
  try {
    await $fetch(`/api/admin/backups/${props.snapshotId}/restore`, {
      method: 'POST',
      body: { confirm_token: confirmInput.value, mode: 'replace' },
    })
    emit('restored')
    emit('update:open', false)
  } catch (err: any) {
    error.value = err?.data?.message ?? err?.message ?? t('admin.backups.restoreDialog.restoreFailed')
  } finally {
    submitting.value = false
  }
}
</script>
