<template>
  <section class="mx-auto max-w-4xl px-5 py-12">
    <UButton to="/" variant="ghost" color="neutral" icon="i-lucide-arrow-left" class="mb-8">
      Back
    </UButton>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Concept not found" />

    <template v-else-if="data">
      <header class="mb-8 border-b border-stone-200 pb-8">
        <p class="text-sm font-medium uppercase tracking-wider text-teal-700">Concept</p>
        <h1 class="mt-2 text-4xl font-bold tracking-normal text-stone-950">{{ data.concept.name }}</h1>
        <p v-if="data.concept.description" class="mt-4 text-stone-600">{{ data.concept.description }}</p>
      </header>

      <div v-if="data.posts.length" class="grid gap-4">
        <article v-for="post in data.posts" :key="post.id" class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <time v-if="post.published_at" :datetime="post.published_at" class="text-sm text-stone-500">
            {{ formatDate(post.published_at) }}
          </time>
          <h2 class="mt-2 text-2xl font-semibold tracking-normal text-stone-950">
            <NuxtLink :to="`/blog/${post.slug}`" class="hover:text-teal-700">{{ post.title }}</NuxtLink>
          </h2>
          <p v-if="post.summary" class="mt-2 text-stone-600">{{ post.summary }}</p>
        </article>
      </div>

      <UEmpty v-else icon="i-lucide-link" title="No published posts yet" description="Published notes that mention this concept will appear here." />
    </template>
  </section>
</template>

<script setup lang="ts">
import type { ConceptRecord, PostRecord } from '~/types/content'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data, error } = await useAsyncData(`concept-${slug.value}`, () => $fetch<{ concept: ConceptRecord, posts: PostRecord[] }>(`/api/concepts/${slug.value}`))

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}
</script>