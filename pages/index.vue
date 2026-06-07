<template>
  <NuxtLayout name="default">
    <template #sidebar>
      <BlogOwnerBio />
      <BlogTagCloud />
      <BlogCategoryList />
    </template>

    <section class="grid gap-10 md:gap-12">
      <BlogPublishFrequencyHeatmap />

      <section id="recent-posts" class="grid gap-6">
        <div class="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--pb-divider)] pb-4">
          <div>
            <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Latest writing</p>
            <h2 class="mt-1 font-[var(--pb-font-display)] text-3xl font-semibold tracking-normal text-[var(--pb-text)]">Recent posts</h2>
          </div>
        </div>

        <BlogPostCardList
          :posts="posts"
          :pending="pending"
          :error="error"
          fixed-columns
          empty-title="No posts yet"
          empty-description="Once you publish a post it will appear here."
        />

        <footer v-if="!error && totalPages > 1" class="flex flex-col gap-3 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] px-4 py-3 text-sm text-[var(--pb-text-muted)] shadow-[var(--pb-shadow-sm)] md:flex-row md:items-center md:justify-between">
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

const POSTS_PER_PAGE = 15
const page = ref(1)

const fetchWithSession: PublicFetch = (url) => {
  if (import.meta.server) {
    const requestFetch = useRequestFetch() as unknown as PublicFetch
    return requestFetch(url)
  }

  const clientFetch = $fetch as unknown as PublicFetch
  return clientFetch(url)
}

const pageStart = computed(() => (page.value - 1) * POSTS_PER_PAGE)
const dataKey = computed(() => `public-posts:${page.value}:${POSTS_PER_PAGE}`)
const postsPath = computed(() => `/api/posts?limit=${POSTS_PER_PAGE}&start=${pageStart.value}`)

const { data, pending, error } = await useAsyncData(dataKey, () => fetchWithSession<PostsResponse>(postsPath.value), { watch: [page] })
const posts = computed(() => data.value?.posts ?? [])
const totalPosts = computed(() => data.value?.total ?? posts.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalPosts.value / POSTS_PER_PAGE)))
const pageRangeLabel = computed(() => {
  if (!totalPosts.value) return 'No posts'
  const first = pageStart.value + 1
  const last = Math.min(pageStart.value + posts.value.length, totalPosts.value)
  return `Posts ${first}-${last} of ${totalPosts.value}`
})

watch(totalPages, (nextTotalPages) => {
  if (page.value > nextTotalPages) {
    page.value = nextTotalPages
  }
})

function goToPage(nextPage: number) {
  const targetPage = Math.min(Math.max(1, nextPage), totalPages.value)
  if (targetPage === page.value) return

  page.value = targetPage
  if (import.meta.client) {
    nextTick(() => {
      document.getElementById('recent-posts')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}
</script>