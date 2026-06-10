<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <button type="button" class="absolute inset-0 bg-black/40" :aria-label="t('admin.common.close')" @click="emit('close')" />
      <section class="relative w-full max-w-md rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-6 shadow-[var(--pb-shadow-lg)]">
        <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.media.createFolder') }}</h2>
        <p class="mt-1 text-sm text-[var(--pb-text-subtle)]">{{ t('admin.media.createFolderDescription') }}</p>

        <form class="mt-5 space-y-4" @submit.prevent="submit">
          <UFormField :label="t('admin.media.folderName')">
            <UInput v-model="name" :placeholder="t('admin.media.folderNamePlaceholder')" required />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton type="button" color="neutral" variant="ghost" @click="emit('close')">{{ t('admin.media.cancel') }}</UButton>
            <UButton type="submit" :disabled="!canSubmit">{{ t('admin.media.create') }}</UButton>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  'close': []
  'create': [name: string]
}>()

const { t } = useI18n()
const name = ref('')

const canSubmit = computed(() => !!name.value.trim())

function submit() {
  const folderName = name.value.trim()
  if (!folderName) return
  emit('create', folderName)
}
</script>
