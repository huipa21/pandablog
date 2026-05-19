<template>
  <div class="max-w-xl space-y-6">
    <header>
      <h1 class="text-2xl font-semibold">Site visibility</h1>
      <p class="text-sm text-gray-500">
        Controls whether the public site is reachable to anonymous visitors.
      </p>
    </header>

    <section v-if="data" class="space-y-4 rounded-lg border p-4">
      <fieldset class="space-y-3">
        <label class="flex cursor-pointer items-start gap-3">
          <input v-model="selected" type="radio" value="public" class="mt-1">
          <div>
            <div class="font-medium">Public</div>
            <div class="text-sm text-gray-500">
              Anyone can browse the site. Per-post visibility still applies.
            </div>
          </div>
        </label>

        <label class="flex cursor-pointer items-start gap-3">
          <input v-model="selected" type="radio" value="private" class="mt-1">
          <div>
            <div class="font-medium">Private</div>
            <div class="text-sm text-gray-500">
              Only you (logged-in admin) can browse. Anonymous visitors are sent to login.
            </div>
          </div>
        </label>
      </fieldset>

      <div class="flex items-center gap-3">
        <button
          class="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50"
          :disabled="selected === data.mode || saving"
          @click="save"
        >
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
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
