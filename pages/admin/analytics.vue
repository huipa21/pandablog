<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.analytics.eyebrow') }}</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('admin.analytics.title') }}</h1>
        <p class="mt-2 max-w-2xl text-sm text-[var(--pb-text-muted)]">{{ t('admin.analytics.description') }}</p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          v-for="item in rangeItems"
          :key="item.value"
          :variant="range === item.value ? 'solid' : 'soft'"
          color="primary"
          @click="range = item.value"
        >
          {{ item.label }}
        </UButton>
        <UButton icon="i-lucide-refresh-cw" variant="ghost" :loading="pending" @click="refreshAll">
          {{ t('admin.analytics.refresh') }}
        </UButton>
      </div>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :title="t('admin.analytics.loadFailed')" />

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div v-for="card in scorecards" :key="card.label" class="pb-admin-surface p-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm text-[var(--pb-text-muted)]">{{ card.label }}</p>
            <p class="mt-2 text-3xl font-semibold text-[var(--pb-text)]">{{ card.value }}</p>
          </div>
          <UIcon :name="card.icon" class="size-5 text-[var(--pb-primary)]" />
        </div>
        <p v-if="card.hint" class="mt-3 text-xs text-[var(--pb-text-muted)]">{{ card.hint }}</p>
      </div>
    </div>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
      <section class="pb-admin-surface p-5">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.analytics.viewsTrend') }}</h2>
            <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.analytics.viewsTrendDescription') }}</p>
          </div>
        </div>

        <div v-if="pending" class="grid gap-3">
          <USkeleton class="h-64" />
        </div>
        <div v-else-if="chartPoints.length" class="analytics-chart">
          <AdminAnalyticsTrendChart :points="chartPoints" />
        </div>
        <div v-else class="grid h-64 place-items-center text-sm text-[var(--pb-text-muted)]">
          {{ t('admin.analytics.empty') }}
        </div>
      </section>

      <section class="pb-admin-surface p-5">
        <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.analytics.topPages') }}</h2>
        <div class="mt-4 grid gap-3">
          <div v-if="pending" class="grid gap-3">
            <USkeleton v-for="index in 5" :key="index" class="h-9" />
          </div>
          <div v-else-if="topPages.length" class="grid gap-3">
            <div v-for="page in topPages" :key="page.path" class="grid gap-2">
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="truncate font-medium text-[var(--pb-text)]">{{ page.path }}</span>
                <span class="text-[var(--pb-text-muted)]">{{ formatNumber(page.views) }}</span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-[var(--pb-selected-bg)]">
                <div class="h-full rounded-full bg-[var(--pb-primary)]" :style="{ width: `${page.percent}%` }" />
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.analytics.empty') }}</p>
        </div>
      </section>
    </div>

    <section class="pb-admin-surface p-5">
      <div class="mb-4 flex flex-col gap-1">
        <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.analytics.geoDistribution') }}</h2>
        <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.analytics.geoDescription') }}</p>
      </div>

      <div v-if="geoPending" class="grid gap-3 md:grid-cols-2">
        <USkeleton v-for="index in 6" :key="index" class="h-14" />
      </div>
      <div v-else-if="locations.length" class="grid gap-3 md:grid-cols-2">
        <div v-for="location in locations" :key="location.key" class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-[var(--pb-text)]">{{ location.label }}</p>
              <p class="text-xs text-[var(--pb-text-muted)]">{{ location.country }}</p>
            </div>
            <UBadge color="primary" variant="soft">{{ formatNumber(location.views) }}</UBadge>
          </div>
        </div>
      </div>
      <p v-else class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.analytics.emptyGeo') }}</p>

      <p class="mt-4 text-xs text-[var(--pb-text-muted)]">{{ t('admin.analytics.geoAttribution') }}</p>
    </section>
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

type RangePreset = 'today' | '7d' | '30d'

interface AnalyticsOverview {
  scorecards: {
    pageViews: number
    uniqueVisitors: number
    uniqueVisitorsApproximate: boolean
    sessions: number
    bounceRate: number
    avgVisitSeconds: number
  }
  timeseries: Array<{ date: string, pageViews: number }>
}

interface TopPagesResponse {
  pages: Array<{ path: string, views: number }>
}

interface GeoResponse {
  locations: Array<{ country: string, region: string, city: string, views: number }>
}

const { t, locale } = useI18n()
const sessionFetch = useSessionFetch()
const range = ref<RangePreset>('7d')
const rangeItems = computed<Array<{ label: string, value: RangePreset }>>(() => [
  { label: t('admin.analytics.ranges.today'), value: 'today' },
  { label: t('admin.analytics.ranges.sevenDays'), value: '7d' },
  { label: t('admin.analytics.ranges.thirtyDays'), value: '30d' }
])
const analyticsQuery = computed(() => ({ range: range.value }))

const { data: overview, pending: overviewPending, error, refresh: refreshOverview } = await useAsyncData(
  'admin-analytics-overview',
  () => sessionFetch<AnalyticsOverview>('/api/admin/analytics/overview', { query: analyticsQuery.value }),
  { watch: [range] }
)
const { data: topPagesData, pending: topPagesPending, refresh: refreshTopPages } = await useAsyncData(
  'admin-analytics-top-pages',
  () => sessionFetch<TopPagesResponse>('/api/admin/analytics/top-pages', { query: { ...analyticsQuery.value, limit: 8 } }),
  { watch: [range] }
)
const { data: geoData, pending: geoPending, refresh: refreshGeo } = await useAsyncData(
  'admin-analytics-geo',
  () => sessionFetch<GeoResponse>('/api/admin/analytics/geo', { query: { ...analyticsQuery.value, limit: 10 } }),
  { watch: [range] }
)

const pending = computed(() => overviewPending.value || topPagesPending.value)
const numberFormatter = computed(() => new Intl.NumberFormat(locale.value))
const scorecards = computed(() => {
  const stats = overview.value?.scorecards
  return [
    { label: t('admin.analytics.pageViews'), value: formatNumber(stats?.pageViews ?? 0), icon: 'i-lucide-eye' },
    {
      label: t('admin.analytics.uniqueVisitors'),
      value: formatNumber(stats?.uniqueVisitors ?? 0),
      icon: 'i-lucide-users',
      hint: stats?.uniqueVisitorsApproximate ? t('admin.analytics.uniqueVisitorsApproximate') : ''
    },
    { label: t('admin.analytics.bounceRate'), value: formatPercent(stats?.bounceRate ?? 0), icon: 'i-lucide-undo-2' },
    { label: t('admin.analytics.avgVisitTime'), value: formatDuration(stats?.avgVisitSeconds ?? 0), icon: 'i-lucide-clock-3' }
  ]
})
const chartPoints = computed(() => (overview.value?.timeseries ?? []).map((point, index) => ({
  index,
  date: point.date,
  pageViews: point.pageViews
})))
const topPages = computed(() => {
  const pages = topPagesData.value?.pages ?? []
  const maxViews = Math.max(1, ...pages.map(page => page.views))
  return pages.map(page => ({ ...page, percent: Math.max(4, Math.round((page.views / maxViews) * 100)) }))
})
const locations = computed(() => (geoData.value?.locations ?? []).map((location) => {
  const parts = [location.city, location.region].filter(Boolean)
  return {
    ...location,
    key: [location.country, location.region, location.city].join(':'),
    label: parts.length ? parts.join(', ') : location.country
  }
}))

function formatNumber(value: number) {
  return numberFormatter.value.format(value)
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`
}

function formatDuration(seconds: number) {
  if (seconds < 60) return t('admin.analytics.seconds', { count: seconds })
  const minutes = Math.round(seconds / 60)
  return t('admin.analytics.minutes', { count: minutes })
}

async function refreshAll() {
  await Promise.all([refreshOverview(), refreshTopPages(), refreshGeo()])
}
</script>

<style scoped>
.analytics-chart {
  min-height: 260px;
}
</style>
