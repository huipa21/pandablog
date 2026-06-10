<template>
  <div>
    <div v-if="pending" :class="layoutClasses">
      <USkeleton v-for="index in skeletonCount" :key="index" :class="skeletonClasses" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      icon="i-lucide-circle-alert"
      :title="isSitePrivateError ? t('public.postList.sitePrivateTitle') : t('public.postList.loadFailed')"
      :description="isSitePrivateError ? t('public.postList.sitePrivateDescription') : undefined"
    />

    <div v-else-if="posts.length" :class="layoutClasses">
      <article
        v-for="post in posts"
        :key="post.id"
        :class="articleClasses"
      >
        <NuxtLink :to="`/blog/${post.slug}`" :class="mediaLinkClasses">
          <img
            v-if="post.cover_image"
            :src="post.cover_image"
            :alt="post.title"
            :class="imageClasses"
          >
          <div v-else :class="placeholderClasses">
            <UIcon name="i-lucide-newspaper" class="size-10 text-[var(--pb-icon-muted)]" />
          </div>
        </NuxtLink>
        <div :class="contentClasses">
          <h2 :class="titleClasses">
            <NuxtLink :to="`/blog/${post.slug}`" class="hover:text-[var(--pb-link-hover)]">{{ post.title }}</NuxtLink>
          </h2>
          <p v-if="post.summary" :class="summaryClasses">{{ post.summary }}</p>
          <div class="mt-auto pt-5">
            <div class="mb-3 flex items-center gap-3 text-xs text-[var(--pb-text-subtle)]">
              <time v-if="post.published_at" :datetime="post.published_at">{{ formatDate(post.published_at) }}</time>
              <UBadge v-if="post.visibility === 'password'" color="warning" variant="subtle" size="xs">
                {{ t('public.postList.protected') }}
              </UBadge>
            </div>
            <NuxtLink :to="`/blog/${post.slug}`" class="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--pb-link)] hover:text-[var(--pb-link-hover)] hover:underline">
              {{ t('public.postList.readMore') }}
              <UIcon name="i-lucide-arrow-right" class="size-4" />
            </NuxtLink>
          </div>
        </div>
      </article>
    </div>

    <UEmpty v-else icon="i-lucide-file-text" :title="resolvedEmptyTitle" :description="resolvedEmptyDescription" />
  </div>
</template>

<script setup lang="ts">
import type { PostListItem } from '~/types/content'

type PostCardViewMode = 'grid' | 'list'

const props = withDefaults(defineProps<{
  posts: PostListItem[]
  pending?: boolean
  error?: unknown
  emptyTitle?: string
  emptyDescription?: string
  fixedColumns?: boolean
  viewMode?: PostCardViewMode
}>(), {
  pending: false,
  error: undefined,
  emptyTitle: '',
  emptyDescription: '',
  fixedColumns: false,
  viewMode: 'grid'
})

const { t, locale } = useI18n()
const isListView = computed(() => props.viewMode === 'list')
const resolvedEmptyTitle = computed(() => props.emptyTitle || t('public.postList.emptyTitle'))
const resolvedEmptyDescription = computed(() => props.emptyDescription || t('public.postList.emptyDescription'))
const layoutClasses = computed(() => [
  isListView.value ? 'post-card-list' : 'post-card-grid',
  !isListView.value && props.fixedColumns ? 'post-card-grid-fixed' : undefined
])
const skeletonCount = computed(() => isListView.value ? 4 : 6)
const skeletonClasses = computed(() => [
  'rounded-[var(--pb-radius-card-outer)]',
  isListView.value ? 'h-52' : 'h-80'
])
const articleClasses = computed(() => [
  'group overflow-hidden rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] shadow-[var(--pb-shadow-sm)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-card-bg-hover)] hover:shadow-[var(--pb-shadow-md)]',
  isListView.value ? 'post-card-list-item grid' : 'flex h-full flex-col'
])
const mediaLinkClasses = computed(() => [
  'block overflow-hidden bg-[var(--pb-surface-subtle)]',
  isListView.value ? 'h-full' : undefined
])
const imageClasses = computed(() => [
  'w-full object-cover transition duration-500 group-hover:scale-[1.03]',
  isListView.value ? 'aspect-[3/2] md:h-full md:min-h-52 md:aspect-auto' : 'aspect-[3/2]'
])
const placeholderClasses = computed(() => [
  'grid w-full place-items-center bg-[linear-gradient(135deg,var(--pb-surface-subtle),var(--pb-selected-bg))]',
  isListView.value ? 'aspect-[3/2] md:h-full md:min-h-52 md:aspect-auto' : 'aspect-[3/2]'
])
const contentClasses = computed(() => [
  'flex flex-1 flex-col',
  isListView.value ? 'p-5 md:p-6' : 'p-5'
])
const titleClasses = computed(() => [
  'font-[var(--pb-font-display)] font-semibold leading-tight text-[var(--pb-text)]',
  isListView.value ? 'text-2xl' : 'text-xl'
])
const summaryClasses = computed(() => [
  'mt-3 text-sm leading-relaxed text-[var(--pb-text-muted)]',
  isListView.value ? 'line-clamp-3' : 'line-clamp-2'
])

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
  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}
</script>

<style scoped>
.post-card-grid {
  gap: clamp(1.5rem, 2vw, 2rem);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
}

.post-card-list {
  display: grid;
  gap: clamp(1rem, 1.8vw, 1.5rem);
  grid-template-columns: minmax(0, 1fr);
}

.post-card-list-item {
  grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 768px) {
  .post-card-grid-fixed {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .post-card-list-item {
    grid-template-columns: minmax(12rem, 18rem) minmax(0, 1fr);
  }
}
</style>
