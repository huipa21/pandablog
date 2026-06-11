<template>
  <UModal :open="open" @update:open="$emit('update:open', $event)">
    <template #content>
      <div class="p-5">
        <h2 class="text-xl font-semibold text-[var(--pb-text)]">{{ t('admin.backups.importDialog.title') }}</h2>
        <p class="mt-1 text-sm text-[var(--pb-text-muted)]">{{ t('admin.backups.importDialog.description') }}</p>

        <div class="mt-4 grid gap-4">
          <div>
            <label class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.backups.importDialog.dbLabel') }}</label>
            <input ref="dbInput" type="file" accept=".gz" class="mt-1 block w-full text-sm text-[var(--pb-text-muted)]" @change="dbFile = ($event.target as HTMLInputElement).files?.[0] ?? null" />
          </div>
          <div>
            <label class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.backups.importDialog.mediaLabel') }}</label>
            <input ref="mediaInput" type="file" accept=".gz" class="mt-1 block w-full text-sm text-[var(--pb-text-muted)]" @change="mediaFile = ($event.target as HTMLInputElement).files?.[0] ?? null" />
          </div>
          <div>
            <label class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.backups.importDialog.manifestLabel') }}</label>
            <input ref="manifestInput" type="file" accept=".json" class="mt-1 block w-full text-sm text-[var(--pb-text-muted)]" @change="manifestFile = ($event.target as HTMLInputElement).files?.[0] ?? null" />
          </div>
        </div>

        <UAlert v-if="error" color="error" class="mt-4" :description="error" />
        <UAlert v-if="success" color="success" class="mt-4" :description="t('admin.backups.importDialog.importSuccess')" />

        <div class="mt-5 flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="submitting" @click="$emit('update:open', false)">
            {{ t('admin.common.cancel') }}
          </UButton>
          <UButton :loading="submitting" :disabled="!dbFile || !mediaFile" @click="submit">
            {{ submitting ? t('admin.backups.importDialog.importing') : t('admin.backups.importDialog.import') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  'update:open': [value: boolean]
  'imported': [id: string]
}>()

defineProps<{ open: boolean }>()

const { t } = useI18n()
const dbFile = ref<File | null>(null)
const mediaFile = ref<File | null>(null)
const manifestFile = ref<File | null>(null)
const submitting = ref(false)
const error = ref<string | null>(null)
const success = ref(false)

async function submit() {
  if (!dbFile.value || !mediaFile.value) return
  error.value = null
  success.value = false
  submitting.value = true

  try {
    const form = new FormData()
    form.append('db', dbFile.value, 'db.surql.gz')
    form.append('media', mediaFile.value, 'media.tar.gz')
    if (manifestFile.value) {
      form.append('manifest', manifestFile.value, 'manifest.json')
    }

    const result = await $fetch<{ ok: boolean, id: string }>('/api/admin/backups/import', {
      method: 'POST',
      body: form,
    })

    success.value = true
    emit('imported', result.id)
    setTimeout(() => emit('update:open', false), 1200)
  } catch (err: any) {
    error.value = err?.data?.message ?? err?.message ?? t('admin.backups.importDialog.importFailed')
  } finally {
    submitting.value = false
  }
}
</script>
