<template>
  <article class="mx-auto max-w-3xl px-5 py-12">
    <UButton to="/" variant="ghost" color="neutral" icon="i-lucide-arrow-left" class="mb-8">
      Back
    </UButton>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Post not found" />

    <template v-else-if="post">
      <header class="mb-8 border-b border-stone-200 pb-8">
        <time v-if="post.published_at" :datetime="post.published_at" class="text-sm text-stone-500">
          {{ formatDate(post.published_at) }}
        </time>
        <h1 class="mt-3 text-4xl font-bold tracking-normal text-stone-950 md:text-5xl">{{ post.title }}</h1>
        <p v-if="post.summary" class="mt-4 text-lg leading-8 text-stone-600">{{ post.summary }}</p>
      </header>

      <ContentRenderer :node="post.content_json" />
    </template>
  </article>
</template>

<script setup lang="ts">
import type { PostRecord } from '~/types/content'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data: post, error } = await useAsyncData(`post-${slug.value}`, () => $fetch<PostRecord>(`/api/posts/${slug.value}`))

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}
</script>