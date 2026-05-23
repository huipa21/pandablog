<template>
  <form
    class="flex items-center gap-2"
    :class="variant === 'sidebar' ? 'w-full' : 'w-72'"
    role="search"
    @submit.prevent="submit"
  >
    <UInput
      v-model="query"
      :placeholder="placeholder"
      icon="i-lucide-search"
      :ui="{ root: 'w-full' }"
      type="search"
      autocomplete="off"
    />
    <UButton
      v-if="variant === 'sidebar'"
      type="submit"
      color="primary"
      icon="i-lucide-arrow-right"
      :aria-label="placeholder"
    />
  </form>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  variant?: 'sidebar' | 'header'
  placeholder?: string
}>(), {
  variant: 'sidebar',
  placeholder: 'Search posts…'
})

const route = useRoute()
const query = ref<string>(typeof route.query.q === 'string' ? route.query.q : '')

watch(() => route.query.q, (q) => {
  if (typeof q === 'string') query.value = q
})

function submit() {
  const q = query.value.trim()
  if (!q) return
  navigateTo({ path: '/search', query: { q } })
}
void props
</script>
