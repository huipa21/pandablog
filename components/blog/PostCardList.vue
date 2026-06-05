<template>
  <div>
    <div v-if="pending" class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      <USkeleton v-for="index in 6" :key="index" class="h-80 rounded-[var(--pb-radius-card-outer)]" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      icon="i-lucide-circle-alert"
      :title="isSitePrivateError ? 'Site is private' : 'Could not load posts'"
      :description="isSitePrivateError ? 'This blog is currently private. Sign in as admin to view posts.' : undefined"
    />

    <div v-else-if="posts.length" class="post-card-grid grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="post in posts"
        :key="post.id"
        class="group overflow-hidden rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] shadow-[var(--pb-shadow-sm)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-card-bg-hover)] hover:shadow-[var(--pb-shadow-md)]"
      >
        <NuxtLink :to="`/blog/${post.slug}`" class="block overflow-hidden bg-[var(--pb-surface-subtle)]">
          <img
            v-if="post.cover_image"
            :src="post.cover_image"
            :alt="post.title"
            class="aspect-[3/2] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          >
          <div v-else class="grid aspect-[3/2] w-full place-items-center bg-[linear-gradient(135deg,var(--pb-surface-subtle),var(--pb-selected-bg))]">
            <UIcon name="i-lucide-newspaper" class="size-10 text-[var(--pb-icon-muted)]" />
          </div>
        </NuxtLink>
        <div class="p-5">
          <div class="mb-3 flex items-center gap-3 text-xs text-[var(--pb-text-subtle)]">
            <time v-if="post.published_at" :datetime="post.published_at">{{ formatDate(post.published_at) }}</time>
            <UBadge v-if="post.visibility === 'password'" color="warning" variant="subtle" size="xs">
              Protected
            </UBadge>
          </div>
          <h2 class="font-[var(--pb-font-display)] text-xl font-semibold leading-tight text-[var(--pb-text)]">
            <NuxtLink :to="`/blog/${post.slug}`" class="hover:text-[var(--pb-link-hover)]">{{ post.title }}</NuxtLink>
          </h2>
          <p v-if="post.summary" class="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--pb-text-muted)]">{{ post.summary }}</p>
          <NuxtLink :to="`/blog/${post.slug}`" class="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--pb-link)] hover:text-[var(--pb-link-hover)] hover:underline">
            Read more
            <UIcon name="i-lucide-arrow-right" class="size-4" />
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
