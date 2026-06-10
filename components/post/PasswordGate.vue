<template>
  <section class="mx-auto max-w-md px-4 py-12 text-center">
    <h1 class="mb-2 text-xl font-medium">{{ title || t('public.passwordGate.title') }}</h1>
    <p v-if="hint" class="mb-4 text-sm text-gray-500">{{ t('public.passwordGate.hint', { hint }) }}</p>

    <form class="space-y-3" @submit.prevent="submit">
      <input
        ref="input"
        v-model="password"
        type="password"
        :placeholder="t('public.passwordGate.password')"
        class="w-full rounded border px-3 py-2"
        autocomplete="off"
      >
      <button
        type="submit"
        class="w-full rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
        :disabled="busy || !password"
      >
        {{ busy ? t('public.passwordGate.checking') : t('public.passwordGate.unlock') }}
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
const { t } = useI18n()
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
      error.value = err?.statusMessage ?? t('public.passwordGate.tooManyAttempts')
    } else {
      error.value = t('public.passwordGate.incorrect')
    }
  } finally {
    busy.value = false
  }
}
</script>
