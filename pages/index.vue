<template>
  <BlogPostCardList :posts="posts" :pending="pending" :error="error" />
</template>

<script setup lang="ts">
import type { PostListItem } from '~/types/content'

const { data, pending, error } = await useAsyncData('public-posts', () => $fetch<{ posts: PostListItem[] }>('/api/posts'))
const posts = computed(() => data.value?.posts ?? [])
</script>