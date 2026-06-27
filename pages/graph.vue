<template>
  <NuxtLayout name="default">
    <section class="graph-page mx-auto grid min-w-0 gap-5">
      <header class="flex flex-wrap items-end justify-between gap-4 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)] md:p-6">
        <div>
          <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('public.graph.eyebrow') }}</p>
          <h1 class="mt-1 font-[var(--pb-font-display)] text-3xl font-semibold tracking-normal text-[var(--pb-text)] md:text-4xl">
            {{ graphTitle }}
          </h1>
          <p v-if="overview" class="mt-2 text-sm text-[var(--pb-text-subtle)]">
            {{ t('public.graph.overviewSummary', { clusters: overview.clusters.length, posts: overview.totalPosts }) }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton color="neutral" :variant="mode === 'overview' ? 'solid' : 'soft'" icon="i-lucide-orbit" @click="goToOverview">
            {{ t('public.graph.fullTitle') }}
          </UButton>
          <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" @click="goBack">
            {{ t('public.post.back') }}
          </UButton>
        </div>
      </header>

      <div class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-3 shadow-[var(--pb-shadow-sm)] md:p-4">
        <USkeleton v-if="overviewPending || detailPending" class="h-[68vh] min-h-[420px] w-full rounded-[var(--pb-radius-card-inner)]" />
        <UAlert v-else-if="overviewError || detailError" color="error" icon="i-lucide-circle-alert" :title="t('public.graph.loadFailed')" />
        <ClientOnly v-else>
          <BlogGraphSurface
            :mode="surfaceMode"
            height="min(68vh, 720px)"
            :nodes="detailNodes"
            :edges="detailEdges"
            :focus="graphFocus"
            show-controls
            :empty-label="t('public.graph.empty')"
            @node-click="openNode"
          />
        </ClientOnly>
      </div>
    </section>
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { GraphClusterResponse, GraphNode, GraphOverviewResponse, GraphPostResponse, GraphTagResponse } from '~/types/graph'

definePageMeta({ layout: false })

if (!__PB_MODULE_GRAPH_VIEW__) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}

type PublicFetch = <T>(url: string, options?: Record<string, unknown>) => Promise<T>
type DetailResponse = GraphClusterResponse | GraphPostResponse | GraphTagResponse

const route = useRoute()
const { t } = useI18n()
const mode = ref<'overview' | 'detail'>('overview')
const detail = ref<DetailResponse | null>(null)
const detailPending = ref(false)
const detailError = ref<unknown>(null)
let detailRequestToken = 0

const fetchWithSession: PublicFetch = (url, options) => {
  if (import.meta.server) {
    const requestFetch = useRequestFetch() as unknown as PublicFetch
    return requestFetch(url, options)
  }
  const clientFetch = $fetch as unknown as PublicFetch
  return clientFetch(url, options)
}

const { data: overview, pending: overviewPending, error: overviewError } = await useAsyncData('graph-page-overview', () =>
  fetchWithSession<GraphOverviewResponse>('/api/graph/overview')
)

const detailNodes = computed(() => mode.value === 'overview' ? overview.value?.nodes ?? [] : detail.value?.nodes ?? [])
const detailEdges = computed(() => mode.value === 'overview' ? overview.value?.edges ?? [] : detail.value?.edges ?? [])
const surfaceMode = computed(() => mode.value === 'overview' && overview.value && overview.value.clusters.length === 0 ? 'detail' : mode.value)
const detailFocus = computed(() => detail.value && 'focus' in detail.value ? detail.value.focus : null)
const focusedDetailNode = computed(() => {
  if (mode.value !== 'detail' || !detailFocus.value) {
    return null
  }

  return detail.value?.nodes.find((node) => node.id === detailFocus.value) ?? null
})
const overviewFocus = computed(() => {
  if (mode.value !== 'overview') {
    return null
  }

  const nodeId = typeof route.query.node === 'string' ? route.query.node : ''
  if (!nodeId) {
    return null
  }

  return overview.value?.nodes.some((node) => node.id === nodeId) ? nodeId : null
})
const graphFocus = computed(() => mode.value === 'overview' ? overviewFocus.value : detailFocus.value)
const graphTitle = computed(() => {
  if (mode.value === 'detail' && detail.value) {
    if ('category' in detail.value) {
      return detail.value.category.name
    }

    if ('tag' in detail.value) {
      return detail.value.tag.name
    }

    if (focusedDetailNode.value?.type === 'post') {
      return focusedDetailNode.value.title
    }
  }

  if (overviewFocus.value) {
    const focusedOverviewNode = overview.value?.nodes.find((node) => node.id === overviewFocus.value)
    if (focusedOverviewNode) {
      return focusedOverviewNode.type === 'post' ? focusedOverviewNode.title : focusedOverviewNode.name
    }
  }

  return t('public.graph.fullTitle')
})

onMounted(() => {
  void syncFromRoute()
})

watch(() => [route.query.focus, route.query.category, route.query.tag, route.query.node], () => {
  void syncFromRoute()
})

async function syncFromRoute() {
  const focus = typeof route.query.focus === 'string' ? route.query.focus : ''
  const category = typeof route.query.category === 'string' ? route.query.category : ''
  const tag = typeof route.query.tag === 'string' ? route.query.tag : ''
  if (focus) {
    await openFocus(focus)
  } else if (category && !isSyntheticCategorySlug(category)) {
    await openCluster(category)
  } else if (tag && !isSyntheticTagSlug(tag)) {
    await openTag(tag)
  } else {
    showOverview()
  }
}

function showOverview() {
  detailRequestToken += 1
  mode.value = 'overview'
  detail.value = null
  detailPending.value = false
  detailError.value = null
}

function goToOverview() {
  showOverview()
  void navigateTo({ path: '/graph' }, { replace: true })
}

function goBack() {
  if (mode.value === 'detail') {
    goToOverview()
    return
  }

  void navigateTo('/')
}

async function openCluster(slug: string) {
  if (await loadDetail(() => fetchWithSession<GraphClusterResponse>('/api/graph/cluster', { query: { category: slug } }))) {
    mode.value = 'detail'
  }
}

async function openFocus(slug: string) {
  if (await loadDetail(() => fetchWithSession<GraphPostResponse>(`/api/graph/post/${encodeURIComponent(slug)}`))) {
    mode.value = 'detail'
  }
}

async function openTag(slug: string) {
  if (await loadDetail(() => fetchWithSession<GraphTagResponse>('/api/graph/tag', { query: { tag: slug } }))) {
    mode.value = 'detail'
  }
}

async function loadDetail(loader: () => Promise<DetailResponse>): Promise<boolean> {
  const requestToken = detailRequestToken + 1
  detailRequestToken = requestToken
  detailPending.value = true
  detailError.value = null
  try {
    const nextDetail = await loader()
    if (requestToken !== detailRequestToken) {
      return false
    }
    detail.value = nextDetail
    return true
  } catch (error) {
    if (requestToken === detailRequestToken) {
      detailError.value = error
    }
    return false
  } finally {
    if (requestToken === detailRequestToken) {
      detailPending.value = false
    }
  }
}

function openNode(node: GraphNode) {
  if (node.type === 'post') {
    if (mode.value === 'overview') {
      void navigateTo({ path: '/graph', query: { focus: node.slug } })
      return
    }

    void navigateTo(`/blog/${node.slug}`)
    return
  }

  if (node.type === 'category' && !isSyntheticCategorySlug(node.slug)) {
    void navigateTo({ path: '/graph', query: { category: node.slug } })
    return
  }

  if (node.type === 'tag') {
    void navigateTo({ path: '/graph', query: { tag: node.slug } })
  }
}

function isSyntheticCategorySlug(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase()
  return normalizedSlug === 'default' || normalizedSlug === 'uncategorized'
}

function isSyntheticTagSlug(slug: string) {
  return slug.trim().toLowerCase() === 'null'
}
</script>