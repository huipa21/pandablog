<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <header class="space-y-3">
      <h1 class="font-[var(--pb-font-display)] text-3xl font-semibold tracking-normal text-[var(--pb-text)]">Search</h1>
      <div class="flex flex-wrap items-end gap-3">
        <form class="flex flex-1 items-center gap-2" role="search" @submit.prevent="onSubmit">
          <UInput
            v-model="query"
            placeholder="Search posts…"
            icon="i-lucide-search"
            type="search"
            class="flex-1"
            :ui="{ root: 'w-full' }"
          />
          <UButton type="submit" color="primary" icon="i-lucide-arrow-right">Search</UButton>
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
          {{ data.total }} matching post<span v-if="data.total !== 1">s</span> for
          <span class="font-medium text-[var(--pb-text-muted)]">"{{ data.query }}"</span>
        </template>
        <template v-else>Type a query above to search the blog.</template>
      </p>
    </header>

    <div v-if="pending" class="text-[var(--pb-text-subtle)]">Searching…</div>

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
          +{{ result.totalMatches - result.matches.length }} more match<span v-if="result.totalMatches - result.matches.length !== 1">es</span>
        </p>
      </li>
    </ul>

    <p v-else-if="data && data.query" class="text-[var(--pb-text-subtle)]">No matches for "{{ data.query }}".</p>
  </div>
</template>

<script setup lang="ts">
import type { SearchResponse, SearchSort } from '~/types/content'

const route = useRoute()

const query = ref<string>(typeof route.query.q === 'string' ? route.query.q : '')
const sort = ref<SearchSort>(normalizeSort(route.query.sort))

const sortOptions = [
  { label: 'Relevance', value: 'relevance' as const },
  { label: 'Newest first', value: 'date_desc' as const },
  { label: 'Oldest first', value: 'date_asc' as const },
  { label: 'Title A→Z', value: 'title' as const }
]

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

useHead({ title: () => params.value.q ? `Search: ${params.value.q}` : 'Search' })
</script>
