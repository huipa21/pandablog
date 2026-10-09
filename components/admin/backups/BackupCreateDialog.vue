<template>
  <UModal :open="open" @update:open="$emit('update:open', $event)">
    <template #content>
      <div class="p-5">
        <h2 class="text-xl font-semibold text-[var(--pb-text)]">{{ t('admin.backups.createDialog.title') }}</h2>
        <p class="mt-2 text-sm text-[var(--pb-text-muted)]">{{ t('admin.backups.createDialog.description') }}</p>
        <div class="mt-4">
          <label for="backup-note" class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.backups.createDialog.note') }}</label>
          <UInput id="backup-note" v-model="note" :maxlength="500" :placeholder="t('admin.backups.createDialog.notePlaceholder')" class="mt-1" />
        </div>
        <UAlert v-if="error" color="error" class="mt-4" :description="error" />
        <div class="mt-5 flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="submitting" @click="$emit('update:open', false)">{{ t('admin.common.cancel') }}</UButton>
          <UButton :loading="submitting" :disabled="submitting" @click="submit">{{ submitting ? t('admin.backups.createDialog.creating') : t('admin.backups.createDialog.create') }}</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{open: boolean}>()
const emit = defineEmits<{'update:open': [value: boolean], 'created': [id: string]}>()
const { t } = useI18n()
const note = ref(''), submitting = ref(false), error = ref<string | null>(null)
watch(() => props.open, open => {if (open && !submitting.value) {note.value = ''; error.value = null}})
async function submit() {
  if (submitting.value) return
  error.value = null; submitting.value = true
  try {
    const result = await $fetch<{ok: boolean, id: string}>('/api/admin/backups', {method: 'POST', body: {note: note.value || null}})
    emit('created', result.id); emit('update:open', false)
  } catch (err: any) {error.value = err?.data?.message ?? err?.message ?? t('admin.backups.createDialog.createFailed')}
  finally {submitting.value = false}
}
</script>
