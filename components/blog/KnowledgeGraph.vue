<template>
  <div class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--pb-text-subtle)]">
        <UIcon name="i-lucide-network" class="size-4 text-[var(--pb-icon-muted)]" />
        {{ t('public.sidebar.knowledgeGraph') }}
      </div>
      <UButton :to="graphLink" size="xs" color="neutral" variant="ghost" icon="i-lucide-maximize-2" :aria-label="t('public.graph.openFull')" />
    </div>

    <USkeleton v-if="pending" class="h-44 w-full rounded-[var(--pb-radius-card-inner)]" />
    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" :title="t('public.graph.loadFailed')" />
    <ClientOnly v-else>
      <BlogGraphSurface
        mode="detail"
        compact
        height="190px"
        :nodes="data?.nodes ?? []"
        :edges="data?.edges ?? []"
        :focus="data?.focus ?? null"
        :empty-label="t('public.graph.emptyLocal')"
        @node-click="openNode"
      />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { GraphNode, GraphPostResponse } from '~/types/graph'

type PublicFetch = <T>(url: string) => Promise<T>

const props = defineProps<{
  currentSlug: string
}>()

const { t } = useI18n()
const graphLink = computed(() => ({ path: '/graph', query: { focus: props.currentSlug } }))

const fetchWithSession: PublicFetch = (url) => {
  if (import.meta.server) {
    const requestFetch = useRequestFetch() as unknown as PublicFetch
    return requestFetch(url)
  }

  const clientFetch = $fetch as unknown as PublicFetch
  return clientFetch(url)
}

const { data, pending, error } = await useAsyncData(`post-graph-${props.currentSlug}`, () =>
  fetchWithSession<GraphPostResponse>(`/api/graph/post/${encodeURIComponent(props.currentSlug)}`)
)

function openNode(node: GraphNode) {
  if (node.type === 'post') {
    void navigateTo(`/blog/${node.slug}`)
  }
}
</script>
