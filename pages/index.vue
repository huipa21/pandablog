<template>
  <BlogPostCardList :posts="posts" :pending="pending" :error="error" />
</template>

<script setup lang="ts">
import type { PostListItem } from '~/types/content'

const fetchWithSession = import.meta.server ? useRequestFetch() : $fetch
const { data, pending, error } = await useAsyncData('public-posts', () => fetchWithSession<{ posts: PostListItem[] }>('/api/posts'))
const posts = computed(() => data.value?.posts ?? [])
</script>