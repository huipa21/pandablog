<template>
  <NuxtLayout name="default">
    <template #sidebar>
      <BlogOwnerBio />
      <BlogGraphOverviewWidget v-if="graphEnabled" />
      <BlogTagCloud />
      <BlogCategoryList />
    </template>

    <section class="grid min-w-0 gap-10 md:gap-12">
      <BlogPublishFrequencyHeatmap v-if="heatmapEnabled" class="order-1" />

      <section id="posts" class="order-2 grid min-w-0 gap-6">
        <header class="md:hidden">
          <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('public.nav.home') }}</p>
          <h1 class="mt-1 font-[var(--pb-font-display)] text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ siteName }}</h1>
        </header>

        <BlogPostCardList
          :posts="posts"
          :pending="pending && (!isMobileViewport || !posts.length)"
          :error="error"
          :view-mode="effectiveViewMode"
          :grid-columns="gridColumns"
          :empty-title="t('public.home.emptyTitle')"
          :empty-description="t('public.home.emptyDescription')"
        />

        <div v-if="isMobileViewport && canLoadMore" ref="loadMoreTrigger" class="grid gap-3" aria-hidden="true">
          <USkeleton v-if="pending" class="h-36 rounded-[var(--pb-radius-card-outer)]" />
        </div>

        <div v-if="!error && (pending || totalPosts > 0)" class="hidden justify-center md:flex">
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

const { t } = useI18n()
const { siteName } = useSiteSettings()
const graphEnabled = __PB_MODULE_GRAPH_VIEW__
const heatmapEnabled = __PB_MODULE_PUBLISH_ACTIVITY_HEATMAP__
const { viewMode, isMobileViewport, gridColumns } = usePostViewMode()
const page = ref(1)
const loadMoreTrigger = ref<HTMLElement | null>(null)
const mobilePosts = ref<PostListItem[]>([])
let loadMoreObserver: IntersectionObserver | null = null

const fetchWithSession: PublicFetch = (url) => {
  if (import.meta.server) {
    const requestFetch = useRequestFetch() as unknown as PublicFetch
    return requestFetch(url)
  }

  const clientFetch = $fetch as unknown as PublicFetch
  return clientFetch(url)
}

const effectiveViewMode = computed<PostViewMode>(() => isMobileViewport.value ? 'list' : viewMode.value)
const perPageNumber = computed(() => effectiveViewMode.value === 'list' ? 15 : 15 * Math.max(1, gridColumns.value))
const pageStart = computed(() => (page.value - 1) * perPageNumber.value)
const dataKey = computed(() => `public-posts:${page.value}:${perPageNumber.value}`)
const postsPath = computed(() => `/api/posts?limit=${perPageNumber.value}&start=${pageStart.value}`)

const { data, pending, error } = await useAsyncData(dataKey, () => fetchWithSession<PostsResponse>(postsPath.value), { watch: [page, perPageNumber] })
const posts = computed(() => isMobileViewport.value ? mobilePosts.value : data.value?.posts ?? [])
const totalPosts = computed(() => data.value?.total ?? posts.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalPosts.value / perPageNumber.value)))
const canLoadMore = computed(() => isMobileViewport.value && !pending.value && page.value < totalPages.value)

watch(data, (nextData) => {
  const nextPosts = nextData?.posts ?? []
  if (!isMobileViewport.value || page.value <= 1) {
    mobilePosts.value = nextPosts
    return
  }

  const seenIds = new Set(mobilePosts.value.map((post) => post.id))
  mobilePosts.value = [...mobilePosts.value, ...nextPosts.filter((post) => !seenIds.has(post.id))]
}, { immediate: true })

watch(totalPages, (nextTotalPages) => {
  if (page.value > nextTotalPages) {
    page.value = nextTotalPages
  }
})

watch(perPageNumber, () => {
  page.value = 1
}, { flush: 'sync' })

watch(isMobileViewport, () => {
  mobilePosts.value = data.value?.posts ?? []
  page.value = 1
})

watch(page, () => {
  if (import.meta.client && !isMobileViewport.value) {
    nextTick(scrollPostsIntoView)
  }
})

watch([loadMoreTrigger, canLoadMore], syncLoadMoreObserver, { flush: 'post' })

onMounted(() => {
  loadMoreObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      loadNextMobilePage()
    }
  }, { rootMargin: '240px 0px' })
  syncLoadMoreObserver()
})

onBeforeUnmount(() => {
  loadMoreObserver?.disconnect()
})

function goToPage(nextPage: number) {
  const targetPage = Math.min(Math.max(1, nextPage), totalPages.value)
  if (targetPage === page.value) return

  page.value = targetPage
}

function loadNextMobilePage() {
  if (!canLoadMore.value) return
  page.value += 1
}

function syncLoadMoreObserver() {
  if (!import.meta.client) return

  loadMoreObserver?.disconnect()
  if (canLoadMore.value && loadMoreTrigger.value) {
    loadMoreObserver?.observe(loadMoreTrigger.value)
  }
}

function scrollPostsIntoView() {
  document.getElementById('posts')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>