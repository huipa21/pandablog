<template>
  <section class="overflow-hidden rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] shadow-[var(--pb-shadow-sm)]">
    <header class="flex flex-col gap-3 border-b border-[var(--pb-divider)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-[var(--pb-text-subtle)]">Posts</p>
        <h2 class="text-lg font-semibold tracking-normal text-[var(--pb-text)]">{{ totalPosts }} post{{ totalPosts === 1 ? '' : 's' }}</h2>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <USelect v-model="statusFilter" :items="statusFilterOptions" size="sm" class="w-40" />
        <USelect v-model="sortBy" :items="sortOptions" size="sm" class="w-48" />
        <USelect v-model="perPage" :items="perPageOptions" size="sm" class="w-28" />
      </div>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load posts" class="m-4" />

    <div v-if="pending" class="grid gap-3 p-5">
      <USkeleton v-for="index in 4" :key="index" class="h-12" />
    </div>

    <div v-else-if="posts.length" class="overflow-x-auto">
      <table class="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead class="bg-[var(--pb-surface-subtle)] text-xs uppercase tracking-wider text-[var(--pb-text-subtle)]">
          <tr>
            <th class="min-w-64 px-4 py-3 font-medium">Title</th>
            <th class="min-w-48 px-4 py-3 font-medium">Tags</th>
            <th class="min-w-48 px-4 py-3 font-medium">Categories</th>
            <th class="min-w-40 px-4 py-3 font-medium">Privacy</th>
            <th class="min-w-32 px-4 py-3 font-medium">Status</th>
            <th class="min-w-36 px-4 py-3 font-medium">Published</th>
            <th class="min-w-36 px-4 py-3 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--pb-divider)]">
          <tr v-for="post in posts" :key="post.id" class="hover:bg-[var(--pb-card-bg-hover)]">
            <td class="px-4 py-3 align-top">
              <NuxtLink :to="`/admin/posts/${encodeURIComponent(post.id)}`" class="font-medium text-[var(--pb-text)] hover:text-[var(--pb-link-hover)]">
                {{ post.title || 'Untitled' }}
              </NuxtLink>
            </td>
            <td class="px-4 py-3 align-top">
              <span v-if="post.tags?.length" class="flex flex-wrap gap-1">
                <UBadge v-for="tag in post.tags" :key="tag.id" color="neutral" variant="subtle">{{ tag.name }}</UBadge>
              </span>
              <span v-else class="text-[var(--pb-text-subtle)]">No tags</span>
            </td>
            <td class="px-4 py-3 align-top">
              <span v-if="post.categories?.length" class="flex flex-wrap gap-1">
                <UBadge v-for="category in post.categories" :key="category.id" color="primary" variant="subtle">{{ category.name }}</UBadge>
              </span>
              <span v-else class="text-[var(--pb-text-subtle)]">No categories</span>
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

    <UEmpty v-else icon="i-lucide-file-text" title="No posts" description="Posts assigned here will appear in this list." class="py-12" />

    <footer class="flex flex-col gap-3 border-t border-[var(--pb-divider)] px-4 py-3 text-sm text-[var(--pb-text-muted)] md:flex-row md:items-center md:justify-between">
      <span>{{ pageRangeLabel }}</span>
      <div class="flex items-center gap-2">
        <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevrons-left" aria-label="First page" :disabled="page <= 1" @click="goToPage(1)" />
        <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevron-left" aria-label="Previous page" :disabled="page <= 1" @click="goToPage(page - 1)" />
        <span class="min-w-24 text-center">Page {{ page }} of {{ totalPages }}</span>
        <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevron-right" aria-label="Next page" :disabled="page >= totalPages" @click="goToPage(page + 1)" />
        <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevrons-right" aria-label="Last page" :disabled="page >= totalPages" @click="goToPage(totalPages)" />
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
const sortBy = ref<AdminPostSort>('updated_desc')
const perPage = ref<PerPageOption>('10')
const page = ref(1)

const statusFilterOptions = [
  { label: 'All active', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Archived', value: 'archived' }
]
const sortOptions = [
  { label: 'Updated newest', value: 'updated_desc' },
  { label: 'Updated oldest', value: 'updated_asc' },
  { label: 'Published newest', value: 'published_desc' },
  { label: 'Published oldest', value: 'published_asc' }
]
const perPageOptions = [
  { label: '10 / page', value: '10' },
  { label: '25 / page', value: '25' },
  { label: '50 / page', value: '50' },
  { label: '100 / page', value: '100' }
]

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
const totalPages = computed(() => Math.max(1, Math.ceil(totalPosts.value / perPageNumber.value)))
const pageRangeLabel = computed(() => {
  if (!totalPosts.value) {
    return 'Showing 0 posts'
  }

  const first = start.value + 1
  const last = Math.min(start.value + posts.value.length, totalPosts.value)
  return `Showing ${first}-${last} of ${totalPosts.value}`
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
    return 'Private'
  }

  if (value === 'password') {
    return 'Password protected'
  }

  return 'Public'
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
    return 'Not published'
  }

  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}
</script>