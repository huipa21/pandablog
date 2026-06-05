<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Tag</p>
      <h1 class="mt-1 font-[var(--pb-font-display)] text-3xl font-semibold tracking-normal text-[var(--pb-text)]">#{{ slug }}</h1>
    </header>

    <BlogPostCardList
      :posts="posts"
      :pending="pending"
      :error="error"
      empty-title="No posts with this tag"
      empty-description="Published posts assigned to this tag will appear here."
    />
  </section>
</template>

<script setup lang="ts">
import type { PostListItem } from '~/types/content'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data, pending, error } = await useAsyncData(`tag-posts-${slug.value}`, () => $fetch<{ posts: PostListItem[] }>('/api/posts', {
  query: { tag: slug.value }
}))
const posts = computed(() => data.value?.posts ?? [])
</script>
