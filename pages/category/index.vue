<template>
  <section class="grid min-w-0 gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('public.category.indexEyebrow') }}</p>
      <h1 class="mt-1 font-[var(--pb-font-display)] text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('public.category.indexTitle') }}</h1>
      <p class="mt-2 text-sm text-[var(--pb-text-muted)]">{{ t('public.category.indexDescription') }}</p>
    </header>

    <div v-if="pending" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <USkeleton v-for="index in 6" :key="index" class="h-16 rounded-[var(--pb-radius-card-outer)]" />
    </div>

    <div v-else-if="categories.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="category in categories"
        :key="category.id"
        :to="`/category/${category.slug}`"
        class="flex items-center justify-between gap-3 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] px-4 py-3 shadow-[var(--pb-shadow-sm)] transition hover:-translate-y-0.5 hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-card-bg-hover)] hover:shadow-[var(--pb-shadow-md)]"
      >
        <span class="min-w-0 truncate font-medium text-[var(--pb-text)]">{{ categoryLabel(category.name) }}</span>
        <span class="inline-flex shrink-0 items-center rounded-[var(--pb-radius-sm)] bg-[var(--pb-surface-subtle)] px-2 py-0.5 text-xs font-semibold text-[var(--pb-text-subtle)]">{{ category.post_count ?? 0 }}</span>
      </NuxtLink>
    </div>

    <p v-else class="text-sm italic text-[var(--pb-text-subtle)]">{{ t('public.category.indexEmpty') }}</p>
  </section>
</template>

<script setup lang="ts">
const { t } = useI18n()
const { data, pending } = await usePublicBootstrap()
const categories = computed(() => (data.value?.categories ?? []).filter((category) => (category.post_count ?? 0) >= 1))

function categoryLabel(value: string) {
  const name = String(value ?? '').trim()
  return name.toLowerCase() === 'default' ? t('public.category.uncategorized') : name
}

useHead(() => ({ title: t('public.category.indexTitle') }))
</script>
