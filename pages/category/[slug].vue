<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Category</p>
      <h1 class="mt-1 font-[var(--pb-font-display)] text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ title }}</h1>
    </header>

    <BlogPostCardList
      :posts="posts"
      :pending="pending"
      :error="error"
      empty-title="No posts in this category"
      empty-description="Published posts assigned to this category will appear here."
    />
  </section>
</template>

<script setup lang="ts">
import type { PostListItem } from '~/types/content'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const title = computed(() => slug.value.replace(/-/g, ' '))
const { data, pending, error } = await useAsyncData(`category-posts-${slug.value}`, () => $fetch<{ posts: PostListItem[] }>('/api/posts', {
  query: { category: slug.value }
}))
const posts = computed(() => data.value?.posts ?? [])
</script>
