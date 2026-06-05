<template>
  <section class="grid gap-10">
    <BlogHomeHero :post="featuredPost" :pending="pending" :error="error" />

    <section class="grid gap-5">
      <div class="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--pb-divider)] pb-4">
        <div>
          <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Latest writing</p>
          <h2 class="mt-1 font-[var(--pb-font-display)] text-3xl font-semibold tracking-normal text-[var(--pb-text)]">Recent posts</h2>
        </div>
        <p v-if="posts.length" class="text-sm text-[var(--pb-text-subtle)]">
          {{ posts.length }} published post<span v-if="posts.length !== 1">s</span>
        </p>
      </div>

      <BlogPostCardList
        :posts="remainingPosts"
        :pending="pending"
        :error="error"
        empty-title="No more posts yet"
        empty-description="The featured post is the full archive for now."
      />
    </section>
  </section>
</template>

<script setup lang="ts">
import type { PostListItem } from '~/types/content'

type PublicFetch = <T>(url: string) => Promise<T>

const fetchWithSession: PublicFetch = (url) => {
  if (import.meta.server) {
    const requestFetch = useRequestFetch() as unknown as PublicFetch
    return requestFetch(url)
  }

  const clientFetch = $fetch as unknown as PublicFetch
  return clientFetch(url)
}

const { data, pending, error } = await useAsyncData('public-posts', () => fetchWithSession<{ posts: PostListItem[] }>('/api/posts'))
const posts = computed(() => data.value?.posts ?? [])
const featuredPost = computed(() => posts.value[0] ?? null)
const remainingPosts = computed(() => posts.value.slice(1))
</script>