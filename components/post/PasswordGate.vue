<template>
  <section class="mx-auto max-w-md px-4 py-12 text-center">
    <h1 class="mb-2 text-xl font-medium">{{ title || 'This post is protected' }}</h1>
    <p v-if="hint" class="mb-4 text-sm text-gray-500">Hint: {{ hint }}</p>

    <form class="space-y-3" @submit.prevent="submit">
      <input
        ref="input"
        v-model="password"
        type="password"
        placeholder="Password"
        class="w-full rounded border px-3 py-2"
        autocomplete="off"
      >
      <button
        type="submit"
        class="w-full rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
        :disabled="busy || !password"
      >
        {{ busy ? 'Checking...' : 'Unlock' }}
      </button>
    </form>

    <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{
  slug: string
  title?: string | null
  hint?: string | null
}>()

const password = ref('')
const busy = ref(false)
const error = ref('')
const input = ref<HTMLInputElement>()

onMounted(() => {
  input.value?.focus()
})

async function submit() {
  busy.value = true
  error.value = ''

  try {
    await $fetch(`/api/posts/${encodeURIComponent(props.slug)}/unlock`, {
      method: 'POST',
      body: { password: password.value }
    })
    reloadNuxtApp({ force: true })
  } catch (err: any) {
    if (err?.statusCode === 429) {
      error.value = err?.statusMessage ?? 'Too many attempts. Try again later.'
    } else {
      error.value = 'Incorrect password.'
    }
  } finally {
    busy.value = false
  }
}
</script>
