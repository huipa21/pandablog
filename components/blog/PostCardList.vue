<template>
  <div>
    <div v-if="pending" class="space-y-4">
      <USkeleton v-for="index in 3" :key="index" class="h-40 rounded-lg" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      icon="i-lucide-circle-alert"
      :title="isSitePrivateError ? 'Site is private' : 'Could not load posts'"
      :description="isSitePrivateError ? 'This blog is currently private. Sign in as admin to view posts.' : undefined"
    />

    <div v-else-if="posts.length" class="grid gap-6">
      <article
        v-for="post in posts"
        :key="post.id"
        class="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm transition hover:shadow-md"
      >
        <NuxtLink :to="`/blog/${post.slug}`" class="block">
          <img
            v-if="post.cover_image"
            :src="post.cover_image"
            :alt="post.title"
            class="h-48 w-full object-cover"
          >
        </NuxtLink>
        <div class="p-5">
          <div class="mb-2 flex items-center gap-3 text-xs text-stone-500">
            <time v-if="post.published_at" :datetime="post.published_at">{{ formatDate(post.published_at) }}</time>
            <UBadge v-if="post.visibility === 'password'" color="warning" variant="subtle" size="xs">
              Protected
            </UBadge>
          </div>
          <h2 class="text-xl font-semibold text-stone-950">
            <NuxtLink :to="`/blog/${post.slug}`" class="hover:text-teal-700">{{ post.title }}</NuxtLink>
          </h2>
          <p v-if="post.summary" class="mt-2 line-clamp-3 text-sm leading-relaxed text-stone-600">{{ post.summary }}</p>
          <NuxtLink :to="`/blog/${post.slug}`" class="mt-3 inline-block text-sm font-medium text-teal-700 hover:underline">
            Read more
          </NuxtLink>
        </div>
      </article>
    </div>

    <UEmpty v-else icon="i-lucide-file-text" :title="emptyTitle" :description="emptyDescription" />
  </div>
</template>

<script setup lang="ts">
import type { PostListItem } from '~/types/content'

const props = withDefaults(defineProps<{
  posts: PostListItem[]
  pending?: boolean
  error?: unknown
  emptyTitle?: string
  emptyDescription?: string
}>(), {
  pending: false,
  emptyTitle: 'No published posts yet',
  emptyDescription: 'Publish your first note from the admin area.'
})

const isSitePrivateError = computed(() => {
  const err = props.error as {
    statusCode?: number
    status?: number
    statusMessage?: string
    message?: string
    data?: { message?: string }
  } | null | undefined

  const statusCode = Number(err?.statusCode ?? err?.status ?? 0)
  const message = String(err?.statusMessage ?? err?.data?.message ?? err?.message ?? '').toLowerCase()
  return statusCode === 401 && message.includes('site is private')
})

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}
</script>
