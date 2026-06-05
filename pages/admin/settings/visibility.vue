<template>
  <div class="max-w-2xl space-y-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Settings</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">Site visibility</h1>
      <p class="mt-2 text-sm text-[var(--pb-text-muted)]">
        Controls whether the public site is reachable to anonymous visitors.
      </p>
    </header>

    <section v-if="data" class="space-y-4 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
      <fieldset class="space-y-3">
        <label class="flex cursor-pointer items-start gap-3 rounded-[var(--pb-radius-card-inner)] border p-3" :class="selected === 'public' ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)]' : 'border-[var(--pb-divider)]'">
          <input v-model="selected" type="radio" value="public" class="mt-1">
          <div>
            <div class="font-medium text-[var(--pb-text)]">Public</div>
            <div class="text-sm text-[var(--pb-text-muted)]">
              Anyone can browse the site. Per-post visibility still applies.
            </div>
          </div>
        </label>

        <label class="flex cursor-pointer items-start gap-3 rounded-[var(--pb-radius-card-inner)] border p-3" :class="selected === 'private' ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)]' : 'border-[var(--pb-divider)]'">
          <input v-model="selected" type="radio" value="private" class="mt-1">
          <div>
            <div class="font-medium text-[var(--pb-text)]">Private</div>
            <div class="text-sm text-[var(--pb-text-muted)]">
              Only you (logged-in admin) can browse. Anonymous visitors are sent to login.
            </div>
          </div>
        </label>
      </fieldset>

      <div class="flex items-center gap-3">
        <UButton
          type="button"
          icon="i-lucide-save"
          :disabled="selected === data.mode || saving"
          @click="save"
        >
          {{ saving ? 'Saving...' : 'Save' }}
        </UButton>
        <span v-if="message" class="text-sm" :class="error ? 'text-red-600' : 'text-green-600'">
          {{ message }}
        </span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { data, refresh } = await useFetch<{ mode: 'public' | 'private' }>('/api/admin/site/visibility')

const selected = ref<'public' | 'private'>(data.value?.mode ?? 'public')
const saving = ref(false)
const message = ref('')
const error = ref(false)

watch(() => data.value?.mode, (mode) => {
  if (mode) {
    selected.value = mode
  }
})

async function save() {
  saving.value = true
  message.value = ''
  error.value = false

  try {
    await $fetch('/api/admin/site/visibility', {
      method: 'POST',
      body: { mode: selected.value }
    })
    message.value = 'Saved.'
    await refresh()
  } catch (err: any) {
    error.value = true
    message.value = err?.statusMessage ?? err?.message ?? 'Save failed'
  } finally {
    saving.value = false
  }
}
</script>
