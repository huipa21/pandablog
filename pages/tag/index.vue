<template>
  <section class="grid min-w-0 gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('public.tag.indexEyebrow') }}</p>
      <h1 class="mt-1 font-[var(--pb-font-display)] text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('public.tag.indexTitle') }}</h1>
      <p class="mt-2 text-sm text-[var(--pb-text-muted)]">{{ t('public.tag.indexDescription') }}</p>
    </header>

    <div v-if="pending" class="flex flex-wrap gap-2">
      <USkeleton v-for="index in 8" :key="index" class="h-8 w-20 rounded-full" />
    </div>

    <div v-else-if="tags.length" class="flex flex-wrap gap-2">
      <NuxtLink
        v-for="tag in tags"
        :key="tag.id"
        :to="`/tag/${tag.slug}`"
        class="inline-flex items-center gap-1.5 rounded-full border border-[var(--pb-divider)] bg-[var(--pb-surface-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--pb-text-muted)] transition hover:-translate-y-0.5 hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)] hover:text-[var(--pb-link-hover)]"
      >
        <span>#{{ tag.name }}</span>
        <span class="text-xs text-[var(--pb-text-subtle)]">{{ tag.post_count ?? 0 }}</span>
      </NuxtLink>
    </div>

    <p v-else class="text-sm italic text-[var(--pb-text-subtle)]">{{ t('public.tag.indexEmpty') }}</p>
  </section>
</template>

<script setup lang="ts">
const { t } = useI18n()
const { data, pending } = await usePublicBootstrap()
const tags = computed(() => (data.value?.tags ?? []).filter((tag) => {
  const name = String(tag.name ?? '').trim().toLowerCase()
  const slug = String(tag.slug ?? '').trim().toLowerCase()
  return Boolean(name) && name !== 'null' && slug !== 'null' && (tag.post_count ?? 0) >= 1
}))

useHead(() => ({ title: t('public.tag.indexTitle') }))
</script>
