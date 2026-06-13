<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.mediaDashboard.eyebrow') }}</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('admin.mediaDashboard.title') }}</h1>
        <p class="mt-2 max-w-2xl text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.description') }}</p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="flex flex-wrap gap-1 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-1">
          <UButton
            v-for="item in rangeItems"
            :key="item.value"
            size="sm"
            color="primary"
            :variant="range === item.value ? 'solid' : 'ghost'"
            @click="range = item.value"
          >
            {{ item.label }}
          </UButton>
        </div>
        <UButton to="/admin/media" icon="i-lucide-images" variant="soft" color="primary">
          {{ t('admin.mediaDashboard.openLibrary') }}
        </UButton>
        <UButton icon="i-lucide-refresh-cw" variant="ghost" :loading="pending" @click="refreshDashboard">
          {{ t('admin.mediaDashboard.refresh') }}
        </UButton>
      </div>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :title="t('admin.mediaDashboard.loadFailed')" />

    <section class="grid gap-4">
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.mediaDashboard.inventory') }}</h2>
        <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.inventoryDescription') }}</p>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <template v-if="pending">
          <div v-for="index in 3" :key="index" class="pb-admin-surface p-5">
            <USkeleton class="h-20" />
          </div>
        </template>
        <template v-else>
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
        </template>
      </div>

      <section class="pb-admin-surface p-5">
        <div class="mb-4 flex flex-col gap-1">
          <h3 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.mediaDashboard.byType') }}</h3>
          <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.byTypeDescription') }}</p>
        </div>

        <div v-if="pending" class="grid gap-3">
          <USkeleton v-for="index in 6" :key="index" class="h-11" />
        </div>
        <div v-else-if="summary.total_items" class="grid gap-3">
          <NuxtLink v-for="type in byType" :key="type.type" :to="typeMediaPath(type.type)" class="grid gap-2 rounded-[var(--pb-radius-card-inner)] p-2 transition hover:bg-[var(--pb-selected-bg)]">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="font-medium text-[var(--pb-text)]">{{ typeLabel(type.type) }}</span>
              <span class="shrink-0 text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.typeLine', { count: formatNumber(type.count), storage: formatSize(type.storage) }) }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-[var(--pb-selected-bg)]">
              <div class="h-full rounded-full bg-[var(--pb-primary)]" :style="{ width: barWidth(type.count, maxTypeCount) }" />
            </div>
          </NuxtLink>
        </div>
        <p v-else class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.empty') }}</p>
      </section>
    </section>

    <section class="grid gap-4">
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.mediaDashboard.timeInsights') }}</h2>
        <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.timeInsightsDescription') }}</p>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <template v-if="pending">
          <div v-for="index in 4" :key="index" class="pb-admin-surface p-5">
            <USkeleton class="h-20" />
          </div>
        </template>
        <template v-else>
          <div v-for="card in rangeCards" :key="card.label" class="pb-admin-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm text-[var(--pb-text-muted)]">{{ card.label }}</p>
                <p class="mt-2 text-3xl font-semibold text-[var(--pb-text)]">{{ card.value }}</p>
              </div>
              <UIcon :name="card.icon" class="size-5 text-[var(--pb-primary)]" />
            </div>
            <p v-if="card.hint" class="mt-3 text-xs text-[var(--pb-text-muted)]">{{ card.hint }}</p>
          </div>
        </template>
      </div>

      <section class="pb-admin-surface p-5">
        <div class="mb-4 flex flex-col gap-1">
          <h3 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.mediaDashboard.rangeByType') }}</h3>
          <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.rangeByTypeDescription') }}</p>
        </div>

        <div v-if="pending" class="grid gap-3">
          <USkeleton v-for="index in 6" :key="index" class="h-11" />
        </div>
        <div v-else-if="timeInsights.uploaded_items" class="grid gap-3">
          <NuxtLink v-for="type in timeInsights.by_type" :key="type.type" :to="typeMediaPath(type.type)" class="grid gap-2 rounded-[var(--pb-radius-card-inner)] p-2 transition hover:bg-[var(--pb-selected-bg)]">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="font-medium text-[var(--pb-text)]">{{ typeLabel(type.type) }}</span>
              <span class="shrink-0 text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.typeLine', { count: formatNumber(type.count), storage: formatSize(type.storage) }) }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-[var(--pb-selected-bg)]">
              <div class="h-full rounded-full bg-[var(--pb-primary)]" :style="{ width: barWidth(type.count, timeInsights.uploaded_items) }" />
            </div>
          </NuxtLink>
        </div>
        <p v-else class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.emptyRange') }}</p>
      </section>
    </section>

    <section class="grid gap-4">
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.mediaDashboard.storageWeight') }}</h2>
        <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.storageWeightDescription') }}</p>
      </div>

      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section class="pb-admin-surface p-5">
          <div class="mb-4 flex flex-col gap-1">
            <h3 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.mediaDashboard.largestFiles') }}</h3>
            <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.largestFilesDescription') }}</p>
          </div>

          <div v-if="pending" class="grid gap-3">
            <USkeleton v-for="index in 5" :key="index" class="h-14" />
          </div>
          <div v-else-if="largestFiles.length" class="grid gap-3">
            <NuxtLink v-for="file in largestFiles" :key="file.hash" :to="fileMediaPath(file)" class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3 transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)]">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-[var(--pb-text)]">{{ file.name }}</p>
                  <p class="mt-1 text-xs text-[var(--pb-text-muted)]">{{ typeLabel(file.type) }} · {{ t('admin.mediaDashboard.referenceCount', { count: formatNumber(file.reference_count) }) }}</p>
                </div>
                <span class="shrink-0 text-sm font-semibold text-[var(--pb-text)]">{{ formatSize(file.size) }}</span>
              </div>
            </NuxtLink>
          </div>
          <p v-else class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.noLargestFiles') }}</p>
        </section>

        <section class="pb-admin-surface p-5">
          <div class="mb-4 flex flex-col gap-1">
            <h3 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.mediaDashboard.storageByType') }}</h3>
            <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.storageByTypeDescription') }}</p>
          </div>

          <div v-if="pending" class="grid gap-3">
            <USkeleton v-for="index in 6" :key="index" class="h-11" />
          </div>
          <div v-else-if="summary.total_storage" class="grid gap-3">
            <NuxtLink v-for="type in storageByType" :key="type.type" :to="typeMediaPath(type.type)" class="grid gap-2 rounded-[var(--pb-radius-card-inner)] p-2 transition hover:bg-[var(--pb-selected-bg)]">
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="font-medium text-[var(--pb-text)]">{{ typeLabel(type.type) }}</span>
                <span class="shrink-0 text-[var(--pb-text-muted)]">{{ formatSize(type.storage) }}</span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-[var(--pb-selected-bg)]">
                <div class="h-full rounded-full bg-[var(--pb-primary)]" :style="{ width: barWidth(type.storage, summary.total_storage) }" />
              </div>
            </NuxtLink>
          </div>
          <p v-else class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.emptyStorage') }}</p>
        </section>
      </div>

      <section class="pb-admin-surface p-5">
        <div class="mb-4 flex flex-col gap-1">
          <h3 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.mediaDashboard.oversizedImages') }}</h3>
          <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.oversizedImagesDescription', { threshold: formatSize(oversized.threshold_bytes) }) }}</p>
        </div>

        <div v-if="pending" class="grid gap-3 md:grid-cols-2">
          <USkeleton v-for="index in 4" :key="index" class="h-14" />
        </div>
        <div v-else-if="oversized.files.length" class="grid gap-3 md:grid-cols-2">
          <NuxtLink v-for="file in oversized.files" :key="file.hash" :to="fileMediaPath(file)" class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3 transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)]">
            <div class="flex items-start justify-between gap-3">
              <p class="min-w-0 truncate text-sm font-semibold text-[var(--pb-text)]">{{ file.name }}</p>
              <span class="shrink-0 text-sm font-semibold text-[var(--pb-text)]">{{ formatSize(file.size) }}</span>
            </div>
          </NuxtLink>
        </div>
        <p v-else class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.noOversizedImages') }}</p>
      </section>
    </section>

    <section class="grid gap-4">
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.mediaDashboard.usageCleanup') }}</h2>
        <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.usageCleanupDescription') }}</p>
      </div>

      <div class="grid gap-5 xl:grid-cols-2">
        <section class="pb-admin-surface p-5">
          <div class="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.mediaDashboard.orphans') }}</h3>
              <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.orphansDescription') }}</p>
            </div>
            <UBadge color="warning" variant="soft">{{ formatNumber(orphans.count) }}</UBadge>
          </div>

          <div v-if="pending" class="grid gap-3">
            <USkeleton v-for="index in 5" :key="index" class="h-14" />
          </div>
          <div v-else-if="orphans.files.length" class="grid gap-3">
            <NuxtLink v-for="file in orphans.files" :key="file.hash" :to="fileMediaPath(file)" class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3 transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)]">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-[var(--pb-text)]">{{ file.name }}</p>
                  <p class="mt-1 text-xs text-[var(--pb-text-muted)]">{{ typeLabel(file.type) }}</p>
                </div>
                <span class="shrink-0 text-sm font-semibold text-[var(--pb-text)]">{{ formatSize(file.size) }}</span>
              </div>
            </NuxtLink>
          </div>
          <p v-else class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.noOrphans') }}</p>
        </section>

        <section class="pb-admin-surface p-5">
          <div class="mb-4 flex flex-col gap-1">
            <h3 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.mediaDashboard.mostReused') }}</h3>
            <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.mostReusedDescription') }}</p>
          </div>

          <div v-if="pending" class="grid gap-3">
            <USkeleton v-for="index in 5" :key="index" class="h-14" />
          </div>
          <div v-else-if="mostReused.length" class="grid gap-3">
            <NuxtLink v-for="file in mostReused" :key="file.hash" :to="fileMediaPath(file)" class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3 transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)]">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-[var(--pb-text)]">{{ file.name }}</p>
                  <p class="mt-1 text-xs text-[var(--pb-text-muted)]">{{ typeLabel(file.type) }} · {{ formatSize(file.size) }}</p>
                </div>
                <UBadge color="primary" variant="soft">{{ t('admin.mediaDashboard.reusedCount', { count: formatNumber(file.reference_count) }) }}</UBadge>
              </div>
            </NuxtLink>
          </div>
          <p v-else class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.mediaDashboard.noReused') }}</p>
        </section>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

type MediaDashboardType = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other'
type RangePreset = 'today' | '7d' | '30d' | '90d' | 'all'

interface MediaDashboardFileItem {
  hash: string
  name: string
  type: MediaDashboardType
  size: number
  reference_count: number
  referenced_by_count: number
  uploaded_at: string
}

interface MediaDashboardTypeStat {
  type: MediaDashboardType
  count: number
  storage: number
}

interface MediaDashboardResponse {
  summary: {
    total_items: number
    total_storage: number
    average_size: number
  }
  by_type: MediaDashboardTypeStat[]
  largest_files: MediaDashboardFileItem[]
  oversized: {
    threshold_bytes: number
    count: number
    files: MediaDashboardFileItem[]
  }
  orphans: {
    count: number
    files: MediaDashboardFileItem[]
  }
  time_insights: {
    range: RangePreset
    start: string | null
    end: string
    uploaded_items: number
    uploaded_storage: number
    average_uploaded_size: number
    oversized_images: number
    orphaned_uploads: number
    by_type: MediaDashboardTypeStat[]
  }
  most_reused: MediaDashboardFileItem[]
}

const { t, locale } = useI18n()
const sessionFetch = useSessionFetch()
const range = ref<RangePreset>('30d')
const rangeItems = computed<Array<{ label: string, value: RangePreset }>>(() => [
  { label: t('admin.mediaDashboard.ranges.today'), value: 'today' },
  { label: t('admin.mediaDashboard.ranges.sevenDays'), value: '7d' },
  { label: t('admin.mediaDashboard.ranges.thirtyDays'), value: '30d' },
  { label: t('admin.mediaDashboard.ranges.ninetyDays'), value: '90d' },
  { label: t('admin.mediaDashboard.ranges.all'), value: 'all' }
])
const { data: dashboard, pending, error, refresh } = await useAsyncData(
  'admin-dashboard-media',
  () => sessionFetch<MediaDashboardResponse>('/api/admin/dashboard/media', { query: { range: range.value } }),
  { watch: [range] }
)

const numberFormatter = computed(() => new Intl.NumberFormat(locale.value))
const summary = computed(() => dashboard.value?.summary ?? emptySummary())
const byType = computed(() => dashboard.value?.by_type ?? emptyTypeStats())
const storageByType = computed(() => byType.value.toSorted((a, b) => b.storage - a.storage || typeLabel(a.type).localeCompare(typeLabel(b.type))))
const largestFiles = computed(() => dashboard.value?.largest_files ?? [])
const oversized = computed(() => dashboard.value?.oversized ?? { threshold_bytes: 0, count: 0, files: [] })
const orphans = computed(() => dashboard.value?.orphans ?? { count: 0, files: [] })
const timeInsights = computed(() => dashboard.value?.time_insights ?? emptyTimeInsights())
const mostReused = computed(() => dashboard.value?.most_reused ?? [])
const maxTypeCount = computed(() => Math.max(...byType.value.map(type => type.count), 0))
const selectedRangeLabel = computed(() => rangeItems.value.find(item => item.value === range.value)?.label ?? '')
const scorecards = computed(() => [
  {
    label: t('admin.mediaDashboard.totalItems'),
    value: formatNumber(summary.value.total_items),
    icon: 'i-lucide-images',
    hint: t('admin.mediaDashboard.totalItemsHint')
  },
  {
    label: t('admin.mediaDashboard.totalStorage'),
    value: formatSize(summary.value.total_storage),
    icon: 'i-lucide-hard-drive',
    hint: t('admin.mediaDashboard.totalStorageHint')
  },
  {
    label: t('admin.mediaDashboard.averageSize'),
    value: formatSize(summary.value.average_size),
    icon: 'i-lucide-scale',
    hint: t('admin.mediaDashboard.averageSizeHint')
  }
])
const rangeCards = computed(() => [
  {
    label: t('admin.mediaDashboard.uploadedItems'),
    value: formatNumber(timeInsights.value.uploaded_items),
    icon: 'i-lucide-upload',
    hint: t('admin.mediaDashboard.rangeHint', { range: selectedRangeLabel.value })
  },
  {
    label: t('admin.mediaDashboard.uploadedStorage'),
    value: formatSize(timeInsights.value.uploaded_storage),
    icon: 'i-lucide-database',
    hint: t('admin.mediaDashboard.averageUploadedSize', { size: formatSize(timeInsights.value.average_uploaded_size) })
  },
  {
    label: t('admin.mediaDashboard.rangeOversizedImages'),
    value: formatNumber(timeInsights.value.oversized_images),
    icon: 'i-lucide-image-upscale',
    hint: t('admin.mediaDashboard.rangeThreshold', { threshold: formatSize(oversized.value.threshold_bytes) })
  },
  {
    label: t('admin.mediaDashboard.rangeOrphans'),
    value: formatNumber(timeInsights.value.orphaned_uploads),
    icon: 'i-lucide-unlink',
    hint: t('admin.mediaDashboard.rangeOrphansHint')
  }
])

function emptySummary(): MediaDashboardResponse['summary'] {
  return {
    total_items: 0,
    total_storage: 0,
    average_size: 0
  }
}

function emptyTypeStats(): MediaDashboardTypeStat[] {
  return ['image', 'video', 'audio', 'document', 'archive', 'other'].map(type => ({
    type: type as MediaDashboardType,
    count: 0,
    storage: 0
  }))
}

function emptyTimeInsights(): MediaDashboardResponse['time_insights'] {
  return {
    range: range.value,
    start: null,
    end: '',
    uploaded_items: 0,
    uploaded_storage: 0,
    average_uploaded_size: 0,
    oversized_images: 0,
    orphaned_uploads: 0,
    by_type: emptyTypeStats()
  }
}

function typeLabel(type: MediaDashboardType) {
  return t(`admin.mediaDashboard.types.${type}`)
}

function formatNumber(value: number) {
  return numberFormatter.value.format(value)
}

function formatSize(value: number) {
  return formatBytes(value) || '0 B'
}

function barWidth(value: number, total: number) {
  if (value <= 0 || total <= 0) return '0%'
  return `${Math.max(4, Math.round((value / total) * 100))}%`
}

function fileMediaPath(file: MediaDashboardFileItem) {
  return { path: '/admin/media', query: { file: file.hash } }
}

function typeMediaPath(type: MediaDashboardType) {
  return { path: '/admin/media', query: { type } }
}

async function refreshDashboard() {
  await refresh()
}
</script>