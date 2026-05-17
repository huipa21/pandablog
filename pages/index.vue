<template>
  <section class="mx-auto max-w-5xl px-5 py-12">
    <div class="mb-10 flex flex-col gap-3">
      <p class="text-sm font-medium uppercase tracking-wider text-teal-700">Personal knowledge</p>
      <h1 class="max-w-3xl text-4xl font-bold tracking-normal text-stone-950 md:text-5xl">
        Notes, essays, and connected ideas.
      </h1>
    </div>

    <div v-if="pending" class="space-y-4">
      <USkeleton v-for="index in 3" :key="index" class="h-28 rounded-lg" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load posts" />

    <div v-else-if="posts.length" class="grid gap-4">
      <article v-for="post in posts" :key="post.id" class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div class="mb-2 flex flex-wrap items-center gap-3 text-sm text-stone-500">
          <time v-if="post.published_at" :datetime="post.published_at">{{ formatDate(post.published_at) }}</time>
        </div>
        <h2 class="text-2xl font-semibold tracking-normal text-stone-950">
          <NuxtLink :to="`/blog/${post.slug}`" class="hover:text-teal-700">{{ post.title }}</NuxtLink>
        </h2>
        <p v-if="post.summary" class="mt-2 max-w-3xl text-stone-600">{{ post.summary }}</p>
      </article>
    </div>

    <UEmpty v-else icon="i-lucide-file-text" title="No published posts yet" description="Publish your first note from the admin area." />
  </section>
</template>

<script setup lang="ts">
import type { PostRecord } from '~/types/content'

const { data, pending, error } = await useAsyncData('public-posts', () => $fetch<{ posts: PostRecord[] }>('/api/posts'))
const posts = computed(() => data.value?.posts ?? [])

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}
</script>