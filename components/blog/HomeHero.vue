<template>
  <section v-if="pending" class="home-hero overflow-hidden rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] shadow-[var(--pb-shadow-md)]">
    <USkeleton class="h-[24rem] w-full" />
  </section>

  <UAlert
    v-else-if="error"
    color="error"
    icon="i-lucide-circle-alert"
    title="Could not load featured post"
  />

  <section
    v-else-if="post"
    class="home-hero grid overflow-hidden rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-hero-bg)] shadow-[var(--pb-shadow-md)] md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]"
  >
    <div class="home-hero-copy flex min-h-[24rem] flex-col justify-end p-6 md:p-10">
      <div class="mb-4 flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-wider text-[var(--pb-text-subtle)]">
        <span>Featured</span>
        <time v-if="post.published_at" :datetime="post.published_at">{{ formatDate(post.published_at) }}</time>
        <UBadge v-if="post.visibility === 'password'" color="warning" variant="subtle" size="xs">
          Protected
        </UBadge>
      </div>

      <h1 class="max-w-3xl font-[var(--pb-font-display)] text-[clamp(2.4rem,6vw,4.75rem)] font-semibold leading-[0.98] tracking-normal text-[var(--pb-text)]">
        {{ post.title }}
      </h1>

      <p v-if="post.summary" class="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--pb-text-muted)]">
        {{ post.summary }}
      </p>

      <div class="mt-7 flex flex-wrap items-center gap-3">
        <UButton :to="`/blog/${post.slug}`" color="primary" size="lg" trailing-icon="i-lucide-arrow-right">
          Read featured
        </UButton>
        <NuxtLink :to="`/blog/${post.slug}`" class="text-sm font-medium text-[var(--pb-link)] hover:text-[var(--pb-link-hover)] hover:underline">
          Continue reading
        </NuxtLink>
      </div>
    </div>

    <NuxtLink :to="`/blog/${post.slug}`" class="home-hero-media block min-h-[18rem] overflow-hidden bg-[var(--pb-surface-subtle)] md:min-h-full">
      <img
        v-if="post.cover_image"
        :src="post.cover_image"
        :alt="post.title"
        class="h-full min-h-[18rem] w-full object-cover transition duration-500 hover:scale-[1.02] md:min-h-full"
      >
      <div v-else class="grid h-full min-h-[18rem] place-items-center bg-[linear-gradient(135deg,var(--pb-surface-subtle),var(--pb-selected-bg))]">
        <UIcon name="i-lucide-book-open" class="size-16 text-[var(--pb-icon-accent)]" />
      </div>
    </NuxtLink>
  </section>
</template>

<script setup lang="ts">
import type { PostListItem } from '~/types/content'

defineProps<{
  post?: PostListItem | null
  pending?: boolean
  error?: unknown
}>()

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}
</script>