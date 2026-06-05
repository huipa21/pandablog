<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <button type="button" class="absolute inset-0 bg-black/40" aria-label="Close" @click="emit('close')" />
      <section class="relative w-full max-w-md rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-6 shadow-[var(--pb-shadow-lg)]">
        <h2 class="text-lg font-semibold text-[var(--pb-text)]">Create Folder</h2>
        <p class="mt-1 text-sm text-[var(--pb-text-subtle)]">Add a folder to organize files in the media library.</p>

        <form class="mt-5 space-y-4" @submit.prevent="submit">
          <UFormField label="Folder name">
            <UInput v-model="name" placeholder="e.g. Images, Logos, Documents" required />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton type="button" color="neutral" variant="ghost" @click="emit('close')">Cancel</UButton>
            <UButton type="submit" :disabled="!canSubmit">Create</UButton>
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

const name = ref('')

const canSubmit = computed(() => !!name.value.trim())

function submit() {
  const folderName = name.value.trim()
  if (!folderName) return
  emit('create', folderName)
}
</script>
