<template>
  <section class="graph-widget min-w-0 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
    <NuxtLink
      to="/graph"
      class="mb-3 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--pb-text-subtle)] transition hover:text-[var(--pb-link-hover)]"
    >
      <span>{{ t('public.graph.fullTitle') }}</span>
      <UIcon name="i-lucide-arrow-right" class="size-3.5" />
    </NuxtLink>

    <USkeleton v-if="pending" class="h-56 w-full rounded-[var(--pb-radius-card-inner)]" />
    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" :title="t('public.graph.loadFailed')" />
    <ClientOnly v-else>
      <BlogGraphSurface
        mode="overview"
        compact
        height="240px"
        :nodes="data?.nodes ?? []"
        :edges="data?.edges ?? []"
        :empty-label="t('public.graph.empty')"
        @node-click="openNode"
      />
    </ClientOnly>

  </section>
</template>

<script setup lang="ts">
import type { GraphOverviewResponse } from '~/types/graph'
import type { GraphNode } from '~/types/graph'

type PublicFetch = <T>(url: string) => Promise<T>

const { t } = useI18n()

const fetchWithSession: PublicFetch = (url) => {
  if (import.meta.server) {
    const requestFetch = useRequestFetch() as unknown as PublicFetch
    return requestFetch(url)
  }
  const clientFetch = $fetch as unknown as PublicFetch
  return clientFetch(url)
}

const { data, pending, error } = await useAsyncData('public-graph-overview', () =>
  fetchWithSession<GraphOverviewResponse>('/api/graph/overview')
)

function openNode(node: GraphNode) {
  if (node.type === 'post') {
    void navigateTo({ path: '/graph', query: { focus: node.slug } })
    return
  }

  if (node.type === 'category') {
    void navigateTo({ path: '/graph', query: { category: node.slug } })
    return
  }

  if (node.type === 'tag') {
    void navigateTo({ path: '/graph', query: { tag: node.slug } })
  }
}
</script>