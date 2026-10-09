<template>
  <UModal :open="open" @update:open="$emit('update:open', $event)">
    <template #content>
      <div class="p-5">
        <h2 class="text-xl font-semibold text-[var(--pb-text)]">{{ t('admin.backups.importDialog.title') }}</h2>
        <p class="mt-1 text-sm text-[var(--pb-text-muted)]">{{ t('admin.backups.importDialog.description') }}</p>
        <div class="mt-4">
          <label for="backup-file" class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.backups.importDialog.backupLabel') }}</label>
          <input id="backup-file" ref="fileInput" type="file" accept=".tar.gz" :disabled="submitting" class="mt-1 block w-full text-sm text-[var(--pb-text-muted)]" @change="backupFile = ($event.target as HTMLInputElement).files?.[0] ?? null" />
        </div>
        <UAlert v-if="error" color="error" class="mt-4" :description="error" />
        <div class="mt-5 flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="submitting" @click="$emit('update:open', false)">{{ t('admin.common.cancel') }}</UButton>
          <UButton :loading="submitting" :disabled="!backupFile || submitting" @click="submit">{{ submitting ? t('admin.backups.importDialog.importing') : t('admin.backups.importDialog.import') }}</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{open: boolean}>()
const emit = defineEmits<{'update:open': [value: boolean], 'imported': [id: string]}>()
const { t } = useI18n()
const backupFile = ref<File | null>(null), fileInput = ref<HTMLInputElement | null>(null)
const submitting = ref(false), error = ref<string | null>(null)
watch(() => props.open, open => {
  if (open && !submitting.value) {backupFile.value = null; error.value = null; if (fileInput.value) fileInput.value.value = ''}
})
async function submit() {
  if (!backupFile.value || submitting.value) return
  error.value = null; submitting.value = true
  try {
    const form = new FormData(); form.append('backup', backupFile.value)
    const result = await $fetch<{ok: boolean, id: string}>('/api/admin/backups/import', {method: 'POST', body: form})
    emit('imported', result.id); emit('update:open', false)
  } catch (err: any) {error.value = err?.data?.message ?? err?.message ?? t('admin.backups.importDialog.importFailed')}
  finally {submitting.value = false}
}
</script>
