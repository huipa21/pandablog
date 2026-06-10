<template>
  <section class="overflow-hidden rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] shadow-[var(--pb-shadow-sm)]">
    <header class="flex flex-col gap-3 border-b border-[var(--pb-divider)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-[var(--pb-text-subtle)]">{{ t('admin.posts.eyebrow') }}</p>
        <h2 class="text-lg font-semibold tracking-normal text-[var(--pb-text)]">{{ postsCountLabel }}</h2>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <USelect v-model="statusFilter" :items="statusFilterOptions" size="sm" class="w-40" />
        <USelect v-model="sortBy" :items="sortOptions" size="sm" class="w-48" />
        <USelect v-model="perPage" :items="perPageOptions" size="sm" class="w-28" />
      </div>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :title="t('admin.posts.loadFailed')" class="m-4" />

    <div v-if="pending" class="grid gap-3 p-5">
      <USkeleton v-for="index in 4" :key="index" class="h-12" />
    </div>

    <div v-else-if="posts.length" class="overflow-x-auto">
      <table class="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead class="bg-[var(--pb-surface-subtle)] text-xs uppercase tracking-wider text-[var(--pb-text-subtle)]">
          <tr>
            <th class="min-w-64 px-4 py-3 font-medium">{{ t('admin.posts.table.title') }}</th>
            <th class="min-w-48 px-4 py-3 font-medium">{{ t('admin.posts.table.tags') }}</th>
            <th class="min-w-48 px-4 py-3 font-medium">{{ t('admin.posts.table.categories') }}</th>
            <th class="min-w-40 px-4 py-3 font-medium">{{ t('admin.posts.table.privacy') }}</th>
            <th class="min-w-32 px-4 py-3 font-medium">{{ t('admin.posts.table.status') }}</th>
            <th class="min-w-36 px-4 py-3 font-medium">{{ t('admin.posts.table.published') }}</th>
            <th class="min-w-36 px-4 py-3 font-medium">{{ t('admin.posts.table.updated') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--pb-divider)]">
          <tr v-for="post in posts" :key="post.id" class="hover:bg-[var(--pb-card-bg-hover)]">
            <td class="px-4 py-3 align-top">
              <NuxtLink :to="`/admin/posts/${encodeURIComponent(post.id)}`" class="font-medium text-[var(--pb-text)] hover:text-[var(--pb-link-hover)]">
                {{ post.title || t('admin.common.untitled') }}
              </NuxtLink>
            </td>
            <td class="px-4 py-3 align-top">
              <span v-if="post.tags?.length" class="flex flex-wrap gap-1">
                <UBadge v-for="tag in post.tags" :key="tag.id" color="neutral" variant="subtle">{{ tag.name }}</UBadge>
              </span>
              <span v-else class="text-[var(--pb-text-subtle)]">{{ t('admin.common.noTags') }}</span>
            </td>
            <td class="px-4 py-3 align-top">
              <span v-if="post.categories?.length" class="flex flex-wrap gap-1">
                <UBadge v-for="category in post.categories" :key="category.id" color="primary" variant="subtle">{{ category.name }}</UBadge>
              </span>
              <span v-else class="text-[var(--pb-text-subtle)]">{{ t('admin.common.noCategories') }}</span>
            </td>
            <td class="px-4 py-3 align-top">
              <span class="inline-flex items-center gap-1.5 text-[var(--pb-text-muted)]">
                <UIcon :name="visibilityIcon(post.visibility)" class="size-4" />
                <span>{{ visibilityLabel(post.visibility) }}</span>
              </span>
            </td>
            <td class="px-4 py-3 align-top">
              <UBadge :color="post.status === 'published' ? 'success' : post.status === 'archived' ? 'warning' : 'neutral'" variant="subtle">
                {{ post.status }}
              </UBadge>
            </td>
            <td class="px-4 py-3 align-top text-[var(--pb-text-muted)]">{{ formatDate(post.published_at) }}</td>
            <td class="px-4 py-3 align-top text-[var(--pb-text-muted)]">{{ formatDate(post.updated_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <UEmpty v-else icon="i-lucide-file-text" :title="t('admin.posts.assignedEmptyTitle')" :description="t('admin.posts.assignedEmptyDescription')" class="py-12" />

    <footer class="flex flex-col gap-3 border-t border-[var(--pb-divider)] px-4 py-3 text-sm text-[var(--pb-text-muted)] md:flex-row md:items-center md:justify-between">
      <span>{{ pageRangeLabel }}</span>
      <div class="flex items-center gap-2">
        <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevrons-left" :aria-label="t('admin.common.firstPage')" :disabled="page <= 1" @click="goToPage(1)" />
        <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevron-left" :aria-label="t('admin.common.previousPage')" :disabled="page <= 1" @click="goToPage(page - 1)" />
        <span class="min-w-24 text-center">{{ t('admin.common.pageOf', { page, total: totalPages }) }}</span>
        <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevron-right" :aria-label="t('admin.common.nextPage')" :disabled="page >= totalPages" @click="goToPage(page + 1)" />
        <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevrons-right" :aria-label="t('admin.common.lastPage')" :disabled="page >= totalPages" @click="goToPage(totalPages)" />
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import type { PostRecord, PostStatus, PostVisibility } from '~/types/content'

type PostStatusFilter = PostStatus | 'all'
type AdminPostSort = 'updated_desc' | 'updated_asc' | 'published_desc' | 'published_asc'
type PerPageOption = '10' | '25' | '50' | '100'

const props = withDefaults(defineProps<{
  categoryIds?: string[]
  tagIds?: string[]
}>(), {
  categoryIds: () => [],
  tagIds: () => []
})

const statusFilter = ref<PostStatusFilter>('all')
const { t, locale } = useI18n()
const sortBy = ref<AdminPostSort>('updated_desc')
const perPage = ref<PerPageOption>('10')
const page = ref(1)

const statusFilterOptions = computed(() => [
  { label: t('admin.posts.filters.allActive'), value: 'all' },
  { label: t('admin.posts.filters.draft'), value: 'draft' },
  { label: t('admin.posts.filters.published'), value: 'published' },
  { label: t('admin.posts.filters.archived'), value: 'archived' }
])
const sortOptions = computed(() => [
  { label: t('admin.posts.filters.updatedNewest'), value: 'updated_desc' },
  { label: t('admin.posts.filters.updatedOldest'), value: 'updated_asc' },
  { label: t('admin.posts.filters.publishedNewest'), value: 'published_desc' },
  { label: t('admin.posts.filters.publishedOldest'), value: 'published_asc' }
])
const perPageOptions = computed(() => [
  { label: t('admin.common.perPage', { count: 10 }), value: '10' },
  { label: t('admin.common.perPage', { count: 25 }), value: '25' },
  { label: t('admin.common.perPage', { count: 50 }), value: '50' },
  { label: t('admin.common.perPage', { count: 100 }), value: '100' }
])

const perPageNumber = computed(() => Number(perPage.value))
const start = computed(() => (page.value - 1) * perPageNumber.value)
const categoryIdsParam = computed(() => props.categoryIds.join(','))
const tagIdsParam = computed(() => props.tagIds.join(','))
const queryParams = computed(() => ({
  ...(statusFilter.value === 'all' ? {} : { status: statusFilter.value }),
  sort: sortBy.value,
  limit: perPageNumber.value,
  start: start.value,
  ...(categoryIdsParam.value ? { category_ids: categoryIdsParam.value } : {}),
  ...(tagIdsParam.value ? { tag_ids: tagIdsParam.value } : {})
}))
const dataKey = computed(() => [
  'admin-taxonomy-posts',
  categoryIdsParam.value,
  tagIdsParam.value,
  statusFilter.value,
  sortBy.value,
  perPage.value,
  page.value
].join(':'))

const { data, pending, error } = await useAsyncData(
  dataKey,
  () => $fetch<{ posts: PostRecord[], total: number, limit: number, start: number }>('/api/admin/posts', { query: queryParams.value }),
  { watch: [queryParams] }
)

const posts = computed(() => data.value?.posts ?? [])
const totalPosts = computed(() => data.value?.total ?? 0)
const postsCountLabel = computed(() => t(totalPosts.value === 1 ? 'admin.posts.countOne' : 'admin.posts.count', { count: totalPosts.value }))
const totalPages = computed(() => Math.max(1, Math.ceil(totalPosts.value / perPageNumber.value)))
const pageRangeLabel = computed(() => {
  if (!totalPosts.value) {
    return t('admin.posts.showingZero')
  }

  const first = start.value + 1
  const last = Math.min(start.value + posts.value.length, totalPosts.value)
  return t('admin.posts.showingRange', { first, last, total: totalPosts.value })
})

watch([statusFilter, sortBy, perPage, categoryIdsParam, tagIdsParam], () => {
  page.value = 1
})

watch(totalPages, (next) => {
  if (page.value > next) {
    page.value = next
  }
})

function goToPage(nextPage: number) {
  page.value = Math.min(Math.max(nextPage, 1), totalPages.value)
}

function visibilityLabel(value: PostVisibility | undefined) {
  if (value === 'private') {
    return t('admin.posts.visibility.private')
  }

  if (value === 'password') {
    return t('admin.posts.visibility.password')
  }

  return t('admin.posts.visibility.public')
}

function visibilityIcon(value: PostVisibility | undefined) {
  if (value === 'private') {
    return 'i-lucide-eye-off'
  }

  if (value === 'password') {
    return 'i-lucide-lock'
  }

  return 'i-lucide-globe-2'
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return t('admin.posts.notPublished')
  }

  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}
</script>