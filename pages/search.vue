<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <header class="space-y-3">
      <h1 class="font-[var(--pb-font-display)] text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('public.search.title') }}</h1>
      <div class="flex flex-wrap items-end gap-3">
        <form class="flex flex-1 items-center gap-2" role="search" @submit.prevent="onSubmit">
          <UInput
            v-model="query"
            :placeholder="t('public.search.placeholder')"
            icon="i-lucide-search"
            type="search"
            class="flex-1"
            :ui="{ root: 'w-full' }"
          />
          <UButton type="submit" color="primary" icon="i-lucide-arrow-right">{{ t('public.search.button') }}</UButton>
        </form>
        <USelectMenu
          v-model="sort"
          :items="sortOptions"
          value-key="value"
          class="w-44"
        />
      </div>
      <p v-if="data" class="text-sm text-[var(--pb-text-subtle)]">
        <template v-if="data.query">
          {{ resultSummary }}
        </template>
        <template v-else>{{ t('public.search.prompt') }}</template>
      </p>
    </header>

    <div v-if="pending" class="text-[var(--pb-text-subtle)]">{{ t('public.search.searching') }}</div>

    <ul v-else-if="data && data.results.length" class="space-y-6">
      <li
        v-for="result in data.results"
        :key="result.post.id"
        class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]"
      >
        <NuxtLink :to="`/blog/${result.post.slug}`" class="text-lg font-semibold text-[var(--pb-link)] hover:text-[var(--pb-link-hover)]">
          {{ result.post.title || result.post.slug }}
        </NuxtLink>
        <p v-if="result.post.summary" class="mt-1 text-sm text-[var(--pb-text-muted)]">{{ result.post.summary }}</p>
        <div class="mt-3 space-y-2">
          <div
            v-for="match in result.matches"
            :key="match.blockId"
            class="rounded-[var(--pb-radius-sm)] border border-[var(--pb-divider)] bg-[var(--pb-surface-subtle)] px-3 py-2 text-sm text-[var(--pb-text-muted)]"
          >
            <span class="mr-2 inline-block rounded-[var(--pb-radius-sm)] bg-[var(--pb-selected-bg)] px-1.5 py-0.5 text-xs uppercase tracking-wide text-[var(--pb-link)]">
              {{ match.type }}
            </span>
            <span v-html="match.snippet" />
          </div>
        </div>
        <p v-if="result.totalMatches > result.matches.length" class="mt-2 text-xs text-[var(--pb-text-subtle)]">
          {{ moreMatchesLabel(result.totalMatches - result.matches.length) }}
        </p>
      </li>
    </ul>

    <p v-else-if="data && data.query" class="text-[var(--pb-text-subtle)]">{{ t('public.search.noMatches', { query: data.query }) }}</p>
  </div>
</template>

<script setup lang="ts">
import type { SearchResponse, SearchSort } from '~/types/content'

const route = useRoute()
const { t } = useI18n()

const query = ref<string>(typeof route.query.q === 'string' ? route.query.q : '')
const sort = ref<SearchSort>(normalizeSort(route.query.sort))

const sortOptions = computed(() => [
  { label: t('public.search.sort.relevance'), value: 'relevance' as const },
  { label: t('public.search.sort.newest'), value: 'date_desc' as const },
  { label: t('public.search.sort.oldest'), value: 'date_asc' as const },
  { label: t('public.search.sort.title'), value: 'title' as const }
])

const params = computed(() => ({
  q: typeof route.query.q === 'string' ? route.query.q : '',
  sort: normalizeSort(route.query.sort)
}))

const { data, pending } = await useAsyncData<SearchResponse | null>(
  () => `search:${params.value.q}:${params.value.sort}`,
  async () => {
    if (!params.value.q) return null
    return await $fetch<SearchResponse>('/api/search', { params: { q: params.value.q, sort: params.value.sort } })
  },
  { watch: [params] }
)
const resultSummary = computed(() => {
  if (!data.value?.query) return ''
  const key = data.value.total === 1 ? 'public.search.resultSummaryOne' : 'public.search.resultSummary'
  return t(key, { total: data.value.total, query: data.value.query })
})

watch(sort, (next) => {
  if (next === params.value.sort) return
  navigateTo({ path: '/search', query: { ...route.query, sort: next } })
})

function onSubmit() {
  const q = query.value.trim()
  if (!q) return
  navigateTo({ path: '/search', query: { q, sort: sort.value } })
}

function normalizeSort(value: unknown): SearchSort {
  if (value === 'date_desc' || value === 'date_asc' || value === 'title' || value === 'relevance') {
    return value
  }
  return 'relevance'
}

function moreMatchesLabel(count: number) {
  return t(count === 1 ? 'public.search.moreMatchesOne' : 'public.search.moreMatches', { count })
}

useHead(() => ({ title: params.value.q ? t('public.search.headWithQuery', { query: params.value.q }) : t('public.search.title') }))
</script>
