<template>
  <div v-if="relatedPosts.length" class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
    <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--pb-text-subtle)]">Related posts</h3>
    <div class="grid gap-3">
      <NuxtLink
        v-for="post in relatedPosts"
        :key="post.id"
        :to="`/blog/${post.slug}`"
        class="group block"
      >
        <div class="text-sm font-medium text-[var(--pb-text)] transition group-hover:text-[var(--pb-link-hover)]">{{ post.title }}</div>
        <time v-if="post.published_at" :datetime="post.published_at" class="text-xs text-[var(--pb-text-subtle)]">
          {{ formatDate(post.published_at) }}
        </time>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PostListItem } from '~/types/content'

const props = defineProps<{
  currentSlug: string
}>()

const { data } = await useAsyncData(`related-posts-${props.currentSlug}`, () => $fetch<{ posts: PostListItem[] }>('/api/posts', {
  query: { limit: 6 }
}))

const relatedPosts = computed(() => (data.value?.posts ?? [])
  .filter((post) => post.slug !== props.currentSlug)
  .slice(0, 5)
)

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}
</script>
