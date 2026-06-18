<template>
  <NuxtLayout name="default">
    <template #sidebar>
      <BlogOwnerBio />
      <BlogTagCloud />
      <BlogCategoryList />
    </template>

    <section class="grid min-w-0 gap-10 md:gap-12">
      <BlogPublishFrequencyHeatmap />

      <section id="posts" class="grid min-w-0 gap-6">
        <div v-if="!error && (pending || totalPosts > 0)" class="flex min-w-0 flex-wrap items-center justify-end gap-2 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] px-4 py-3 shadow-[var(--pb-shadow-sm)]">
          <USelect v-model="perPage" :items="perPageOptions" size="sm" class="w-28 max-w-full shrink-0" :aria-label="t('public.home.postsPerPage')" />
          <div class="inline-flex rounded-[var(--pb-radius-md)] border border-[var(--pb-divider)] bg-[var(--pb-surface-subtle)] p-1">
            <UButton
              size="sm"
              :variant="viewMode === 'grid' ? 'solid' : 'ghost'"
              :color="viewMode === 'grid' ? 'primary' : 'neutral'"
              icon="i-lucide-layout-grid"
              :aria-label="t('public.home.gridView')"
              @click="viewMode = 'grid'"
            />
            <UButton
              size="sm"
              :variant="viewMode === 'list' ? 'solid' : 'ghost'"
              :color="viewMode === 'list' ? 'primary' : 'neutral'"
              icon="i-lucide-list"
              :aria-label="t('public.home.listView')"
              @click="viewMode = 'list'"
            />
          </div>
        </div>

        <BlogPostCardList
          :posts="posts"
          :pending="pending"
          :error="error"
          :view-mode="viewMode"
          :empty-title="t('public.home.emptyTitle')"
          :empty-description="t('public.home.emptyDescription')"
        />

        <div v-if="!error && (pending || totalPosts > 0)" class="flex justify-center">
          <div class="flex items-center gap-3">
            <UButton v-if="page > 1" size="md" variant="outline" color="neutral" icon="i-lucide-arrow-left" :aria-label="t('public.home.previousPage')" @click="goToPage(page - 1)" />
            <UPagination
              v-model:page="page"
              :total="totalPosts"
              :items-per-page="perPageNumber"
              :show-controls="false"
              :sibling-count="1"
              size="md"
              color="neutral"
              active-color="primary"
              variant="outline"
              active-variant="solid"
            />
            <UButton size="md" variant="outline" color="neutral" icon="i-lucide-arrow-right" :aria-label="t('public.home.nextPage')" :disabled="page >= totalPages" @click="goToPage(page + 1)" />
          </div>
        </div>
      </section>
    </section>
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { PostListItem } from '~/types/content'

definePageMeta({ layout: false })

type PublicFetch = <T>(url: string) => Promise<T>
interface PostsResponse {
  posts: PostListItem[]
  total: number
  limit: number
  start: number
}

type PostViewMode = 'grid' | 'list'
type PerPageOption = '10' | '25' | '50' | '100'

const { t } = useI18n()
const page = ref(1)
const viewMode = ref<PostViewMode>('grid')
const perPage = ref<PerPageOption>('10')
const perPageOptions = computed(() => [
  { label: t('public.home.perPage', { count: 10 }), value: '10' },
  { label: t('public.home.perPage', { count: 25 }), value: '25' },
  { label: t('public.home.perPage', { count: 50 }), value: '50' },
  { label: t('public.home.perPage', { count: 100 }), value: '100' }
])

const fetchWithSession: PublicFetch = (url) => {
  if (import.meta.server) {
    const requestFetch = useRequestFetch() as unknown as PublicFetch
    return requestFetch(url)
  }

  const clientFetch = $fetch as unknown as PublicFetch
  return clientFetch(url)
}

const perPageNumber = computed(() => Number(perPage.value))
const pageStart = computed(() => (page.value - 1) * perPageNumber.value)
const dataKey = computed(() => `public-posts:${page.value}:${perPage.value}`)
const postsPath = computed(() => `/api/posts?limit=${perPageNumber.value}&start=${pageStart.value}`)

const { data, pending, error } = await useAsyncData(dataKey, () => fetchWithSession<PostsResponse>(postsPath.value), { watch: [page, perPage] })
const posts = computed(() => data.value?.posts ?? [])
const totalPosts = computed(() => data.value?.total ?? posts.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalPosts.value / perPageNumber.value)))

watch(totalPages, (nextTotalPages) => {
  if (page.value > nextTotalPages) {
    page.value = nextTotalPages
  }
})

watch(perPage, () => {
  page.value = 1
}, { flush: 'sync' })

watch(page, () => {
  if (import.meta.client) {
    nextTick(scrollPostsIntoView)
  }
})

function goToPage(nextPage: number) {
  const targetPage = Math.min(Math.max(1, nextPage), totalPages.value)
  if (targetPage === page.value) return

  page.value = targetPage
}

function scrollPostsIntoView() {
  document.getElementById('posts')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>