<template>
  <div class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
    <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--pb-text-subtle)]">Categories</h3>
    <div v-if="pending" class="grid gap-2">
      <USkeleton v-for="index in 4" :key="index" class="h-6" />
    </div>
    <nav v-else-if="categories.length" class="grid gap-1">
      <NuxtLink
        v-for="category in categories"
        :key="category.id"
        :to="`/category/${category.slug}`"
        class="flex items-center justify-between rounded-[var(--pb-radius-sm)] px-2 py-1 text-sm text-[var(--pb-text-muted)] transition hover:bg-[var(--pb-selected-bg)] hover:text-[var(--pb-link-hover)]"
      >
        <span>{{ categoryLabel(category.name) }}</span>
        <span class="text-xs text-[var(--pb-text-subtle)]">{{ category.post_count ?? 0 }}</span>
      </NuxtLink>
    </nav>
    <p v-else class="text-sm italic text-[var(--pb-text-subtle)]">No categories yet.</p>
  </div>
</template>

<script setup lang="ts">
const { data, pending } = await usePublicBootstrap()
const categories = computed(() => data.value?.categories ?? [])

function categoryLabel(value: string) {
  const name = value.trim()
  return name.toLowerCase() === 'default' ? 'Uncategorized' : name
}
</script>
