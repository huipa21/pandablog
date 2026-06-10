<template>
  <NuxtLayout name="default">
    <template #sidebar>
      <BlogOwnerBio />
      <BlogTagCloud />
      <BlogCategoryList />
    </template>

    <section class="grid gap-10 md:gap-12">
      <BlogPublishFrequencyHeatmap />

      <section id="posts" class="grid gap-6">
        <div v-if="!error && (pending || totalPosts > 0)" class="flex flex-col gap-3 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] px-4 py-3 text-sm text-[var(--pb-text-muted)] shadow-[var(--pb-shadow-sm)] lg:flex-row lg:items-center lg:justify-between">
          <span>{{ pageRangeLabel }}</span>
          <div class="flex flex-wrap items-center gap-2">
            <USelect v-model="perPage" :items="perPageOptions" size="sm" class="w-32" :aria-label="t('public.home.postsPerPage')" />
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
            <div class="flex items-center gap-2">
              <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevrons-left" :aria-label="t('public.home.firstPage')" :disabled="page <= 1" @click="goToPage(1)" />
              <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevron-left" :aria-label="t('public.home.previousPage')" :disabled="page <= 1" @click="goToPage(page - 1)" />
              <span class="min-w-24 text-center">{{ t('public.home.pageOf', { page, total: totalPages }) }}</span>
              <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevron-right" :aria-label="t('public.home.nextPage')" :disabled="page >= totalPages" @click="goToPage(page + 1)" />
              <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevrons-right" :aria-label="t('public.home.lastPage')" :disabled="page >= totalPages" @click="goToPage(totalPages)" />
            </div>
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
type PerPageOption = '9' | '15' | '24' | '48'

const { t } = useI18n()
const page = ref(1)
const viewMode = ref<PostViewMode>('grid')
const perPage = ref<PerPageOption>('15')
const perPageOptions = computed(() => [
  { label: t('public.home.perPage', { count: 9 }), value: '9' },
  { label: t('public.home.perPage', { count: 15 }), value: '15' },
  { label: t('public.home.perPage', { count: 24 }), value: '24' },
  { label: t('public.home.perPage', { count: 48 }), value: '48' }
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
const pageRangeLabel = computed(() => {
  if (!totalPosts.value) return t('public.home.noPosts')
  const first = pageStart.value + 1
  const last = Math.min(pageStart.value + posts.value.length, totalPosts.value)
  return t('public.home.range', { first, last, total: totalPosts.value })
})

watch(totalPages, (nextTotalPages) => {
  if (page.value > nextTotalPages) {
    page.value = nextTotalPages
  }
})

watch(perPage, () => {
  page.value = 1
}, { flush: 'sync' })

function goToPage(nextPage: number) {
  const targetPage = Math.min(Math.max(1, nextPage), totalPages.value)
  if (targetPage === page.value) return

  page.value = targetPage
  if (import.meta.client) {
    nextTick(() => {
      document.getElementById('posts')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}
</script>