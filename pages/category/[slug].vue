<template>
  <section id="posts" class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('public.category.eyebrow') }}</p>
      <h1 class="mt-1 font-[var(--pb-font-display)] text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ title }}</h1>
    </header>

    <div v-if="!error && (pending || totalPosts > 0)" class="flex flex-wrap items-center justify-end gap-2 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] px-4 py-3 shadow-[var(--pb-shadow-sm)]">
      <USelect v-model="perPage" :items="perPageOptions" size="sm" class="w-28" :aria-label="t('public.home.postsPerPage')" />
    </div>

    <BlogPostCardList
      :posts="posts"
      :pending="pending"
      :error="error"
      :empty-title="t('public.category.emptyTitle')"
      :empty-description="t('public.category.emptyDescription')"
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
</template>

<script setup lang="ts">
import type { PostListItem } from '~/types/content'

interface PostsResponse {
  posts: PostListItem[]
  total: number
  limit: number
  start: number
}

type PerPageOption = '10' | '25' | '50' | '100'

const route = useRoute()
const { t } = useI18n()
const slug = computed(() => String(route.params.slug))
const title = computed(() => slug.value.replace(/-/g, ' '))
const page = ref(1)
const perPage = ref<PerPageOption>('10')
const perPageOptions = computed(() => [
  { label: t('public.home.perPage', { count: 10 }), value: '10' },
  { label: t('public.home.perPage', { count: 25 }), value: '25' },
  { label: t('public.home.perPage', { count: 50 }), value: '50' },
  { label: t('public.home.perPage', { count: 100 }), value: '100' }
])

const perPageNumber = computed(() => Number(perPage.value))
const pageStart = computed(() => (page.value - 1) * perPageNumber.value)
const dataKey = computed(() => `category-posts:${slug.value}:${page.value}:${perPage.value}`)
const { data, pending, error } = await useAsyncData(dataKey, () => $fetch<PostsResponse>('/api/posts', {
  query: { category: slug.value, limit: perPageNumber.value, start: pageStart.value }
}), { watch: [slug, page, perPage] })
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
