<template>
  <div class="rounded-lg border border-stone-200 bg-white p-4">
    <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">Tags</h3>
    <UInput v-model="query" size="xs" icon="i-lucide-search" placeholder="Search tags" class="mb-3" />
    <div v-if="pending" class="flex flex-wrap gap-2">
      <USkeleton v-for="index in 5" :key="index" class="h-7 w-16 rounded-full" />
    </div>
    <div v-else-if="visibleTags.length" class="flex flex-wrap gap-2">
      <NuxtLink
        v-for="tag in visibleTags"
        :key="tag.id"
        :to="`/tag/${tag.slug}`"
        class="rounded-full bg-stone-100 px-3 py-1 font-medium text-stone-700 transition hover:-translate-y-0.5 hover:bg-teal-50 hover:text-teal-700"
        :style="tagStyle(tag.post_count ?? 0)"
      >
        #{{ tag.name }}
        <span v-if="tag.post_count" class="ml-1 text-stone-400">{{ tag.post_count }}</span>
      </NuxtLink>
    </div>
    <p v-else class="text-sm italic text-stone-400">No tags yet.</p>
  </div>
</template>

<script setup lang="ts">
const { data, pending } = await usePublicBootstrap()
const tags = computed(() => data.value?.tags ?? [])
const query = ref('')
const maxCount = computed(() => Math.max(1, ...tags.value.map((tag) => tag.post_count ?? 0)))
const visibleTags = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return tags.value.filter((tag) => !needle || tag.name.toLowerCase().includes(needle))
})

function tagStyle(count: number) {
  const weight = Math.max(0, Math.min(1, count / maxCount.value))
  return {
    fontSize: `${0.72 + weight * 0.28}rem`,
    lineHeight: '1.1'
  }
}
</script>
