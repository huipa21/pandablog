<template>
  <div class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
    <NuxtLink
      to="/category"
      class="mb-3 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--pb-text-subtle)] transition hover:text-[var(--pb-link-hover)]"
    >
      <span>{{ t('public.category.allTitle') }}</span>
      <UIcon name="i-lucide-arrow-right" class="size-3.5" />
    </NuxtLink>
    <div v-if="pending" class="grid gap-2">
      <USkeleton v-for="index in 4" :key="index" class="h-6" />
    </div>
    <nav v-else-if="categories.length" class="grid gap-1">
      <NuxtLink
        v-for="category in categories"
        :key="category.id"
        :to="`/category/${category.slug}`"
        class="flex items-center justify-between rounded-[var(--pb-radius-sm)] py-1 text-sm text-[var(--pb-text-muted)] transition hover:bg-[var(--pb-selected-bg)] hover:text-[var(--pb-link-hover)]"
      >
        <span>{{ categoryLabel(category.name) }}</span>
        <span class="text-xs text-[var(--pb-text-subtle)]">{{ category.post_count ?? 0 }}</span>
      </NuxtLink>
    </nav>
    <p v-else class="text-sm italic text-[var(--pb-text-subtle)]">{{ t('public.category.emptyList') }}</p>
  </div>
</template>

<script setup lang="ts">
const { data, pending } = await usePublicBootstrap()
const { t } = useI18n()
const categories = computed(() => data.value?.categories ?? [])

function categoryLabel(value: string) {
  const name = value.trim()
  return name.toLowerCase() === 'default' ? t('public.category.uncategorized') : name
}
</script>
