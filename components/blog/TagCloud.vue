<template>
  <div class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
    <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--pb-text-subtle)]">Tags</h3>
    <div v-if="pending" class="flex flex-wrap gap-2">
      <USkeleton v-for="index in 5" :key="index" class="h-7 w-16 rounded-full" />
    </div>
    <div v-else-if="tags.length" class="flex flex-wrap gap-2">
      <NuxtLink
        v-for="tag in tags"
        :key="tag.id"
        :to="`/tag/${tag.slug}`"
        class="rounded-full border border-[var(--pb-divider)] bg-[var(--pb-surface-subtle)] px-3 py-1 font-medium text-[var(--pb-text-muted)] transition hover:-translate-y-0.5 hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)] hover:text-[var(--pb-link-hover)]"
        :style="tagStyle(tag.post_count ?? 0)"
      >
        #{{ tag.name }}
        <span v-if="tag.post_count" class="ml-1 text-[var(--pb-text-subtle)]">{{ tag.post_count }}</span>
      </NuxtLink>
    </div>
    <p v-else class="text-sm italic text-[var(--pb-text-subtle)]">No tags yet.</p>
  </div>
</template>

<script setup lang="ts">
const { data, pending } = await usePublicBootstrap()
const tags = computed(() => data.value?.tags ?? [])
const maxCount = computed(() => Math.max(1, ...tags.value.map((tag) => tag.post_count ?? 0)))

function tagStyle(count: number) {
  const weight = Math.max(0, Math.min(1, count / maxCount.value))
  return {
    fontSize: `${0.72 + weight * 0.28}rem`,
    lineHeight: '1.1'
  }
}
</script>
