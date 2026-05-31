<template>
  <BlogPostCardList :posts="posts" :pending="pending" :error="error" />
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
</script>