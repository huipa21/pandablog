<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.logs.tools') }}</p>
        <h1 class="mt-1 text-3xl font-semibold text-[var(--pb-text)]">{{ t('admin.logs.title') }}</h1>
        <p class="mt-2 text-sm text-[var(--pb-text-muted)]">{{ t('admin.logs.description') }}</p>
      </div>
      <UButton to="/admin/dashboard/logs/settings" color="neutral" variant="soft" icon="i-lucide-settings">
        {{ t('admin.logs.settings.button') }}
      </UButton>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :title="t('admin.logs.dashboardFailed')" />

    <div class="grid gap-4 md:grid-cols-4">
      <NuxtLink to="/admin/dashboard/logs/access" class="block rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)] transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)] focus-visible:outline-none focus-visible:shadow-[var(--pb-focus-ring)]">
        <p class="text-xs uppercase tracking-wider text-[var(--pb-text-subtle)]">{{ t('admin.logs.accessLogs') }}</p>
        <p class="mt-2 text-2xl font-semibold text-[var(--pb-text)]">{{ stats?.access.count ?? 0 }}</p>
      </NuxtLink>
      <NuxtLink to="/admin/dashboard/logs/activity" class="block rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)] transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)] focus-visible:outline-none focus-visible:shadow-[var(--pb-focus-ring)]">
        <p class="text-xs uppercase tracking-wider text-[var(--pb-text-subtle)]">{{ t('admin.logs.activityLogs') }}</p>
        <p class="mt-2 text-2xl font-semibold text-[var(--pb-text)]">{{ stats?.activity.count ?? 0 }}</p>
      </NuxtLink>
      <NuxtLink to="/admin/dashboard/logs/errors" class="block rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)] transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)] focus-visible:outline-none focus-visible:shadow-[var(--pb-focus-ring)]">
        <p class="text-xs uppercase tracking-wider text-[var(--pb-text-subtle)]">{{ t('admin.logs.errorLogs') }}</p>
        <p class="mt-2 text-2xl font-semibold text-[var(--pb-text)]">{{ stats?.errors.count ?? 0 }}</p>
      </NuxtLink>
      <div class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
        <p class="text-xs uppercase tracking-wider text-[var(--pb-text-subtle)]">{{ t('admin.logs.dbEstimate') }}</p>
        <p class="mt-2 text-2xl font-semibold text-[var(--pb-text)]">{{ formatBytes(stats?.estimate_bytes ?? 0) }}</p>
      </div>
    </div>

    <div class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
      <h2 class="text-sm font-semibold text-[var(--pb-text)]">{{ t('admin.logs.requestsPerHour') }}</h2>
      <div class="mt-4 flex h-44 items-end gap-1 rounded-[var(--pb-radius-card-inner)] bg-[var(--pb-surface-subtle)] px-2 py-3">
        <div
          v-for="(point, index) in hourlyPoints"
          :key="index"
          class="flex-1 rounded-t bg-[var(--pb-selected-border)]/70"
          :title="`${point.label}: ${point.count}`"
          :style="{ height: `${Math.max(6, point.height)}%` }"
        />
      </div>
    </div>

    <div class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-[var(--pb-text)]">{{ t('admin.logs.recentErrors') }}</h2>
        <UButton size="xs" variant="ghost" color="neutral" @click="refreshAll">{{ t('admin.logs.refresh') }}</UButton>
      </div>

      <div v-if="pending" class="mt-3 grid gap-2">
        <USkeleton class="h-14" />
        <USkeleton class="h-14" />
      </div>

      <div v-else-if="!recentErrors.length" class="mt-3 rounded-[var(--pb-radius-card-inner)] border border-dashed border-[var(--pb-divider-strong)] p-4 text-sm text-[var(--pb-text-subtle)]">
        {{ t('admin.logs.noRecentErrors') }}
      </div>

      <div v-else class="mt-3 grid gap-2">
        <article v-for="row in recentErrors" :key="String(row.id)" class="recent-error-card rounded-[var(--pb-radius-card-inner)] border p-3">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <p class="min-w-0 text-sm text-[var(--pb-text)]" :class="isRead(row) ? 'font-medium' : 'font-semibold'">{{ asText(row.message) }}</p>
            <UBadge :color="isRead(row) ? 'neutral' : 'primary'" variant="subtle">{{ isRead(row) ? t('admin.logs.read') : t('admin.logs.unread') }}</UBadge>
          </div>
          <p class="mt-1 break-all text-xs text-[var(--pb-text-muted)]">{{ asText(row.timestamp) }} · {{ asText(row.path) }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const sessionFetch = useSessionFetch()

const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

const { data: statsData, pending: statsPending, error, refresh: refreshStats } = await useAsyncData(
  'admin-log-stats',
  () => sessionFetch('/api/admin/logs/stats')
)
const { data: accessData, pending: accessPending, refresh: refreshAccess } = await useAsyncData(
  'admin-log-access-24h',
  () => sessionFetch('/api/admin/logs/access', { query: { from, limit: 200, sort: 'newest', total: 'false' } })
)
const { data: errorData, pending: errorPending, refresh: refreshErrors } = await useAsyncData(
  'admin-log-errors-recent',
  () => sessionFetch('/api/admin/logs/errors', { query: { from, limit: 5, sort: 'newest', total: 'false' } })
)

const stats = computed(() => statsData.value as any)
const recentErrors = computed(() => Array.isArray((errorData.value as any)?.rows) ? (errorData.value as any).rows : [])
const pending = computed(() => statsPending.value || accessPending.value || errorPending.value)

const hourlyPoints = computed(() => {
  const rows = Array.isArray((accessData.value as any)?.rows) ? (accessData.value as any).rows : []
  const buckets = Array.from({ length: 24 }, (_, index) => {
    const hour = new Date(Date.now() - (23 - index) * 3600_000)
    return {
      key: `${hour.getUTCFullYear()}-${hour.getUTCMonth() + 1}-${hour.getUTCDate()}-${hour.getUTCHours()}`,
      label: `${hour.getUTCHours().toString().padStart(2, '0')}:00`,
      count: 0,
      height: 0
    }
  })
  const bucketMap = new Map(buckets.map(item => [item.key, item]))

  for (const row of rows) {
    const timestamp = Date.parse(String((row as any).timestamp ?? ''))
    if (!Number.isFinite(timestamp)) {
      continue
    }

    const date = new Date(timestamp)
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}-${date.getUTCHours()}`
    const bucket = bucketMap.get(key)
    if (bucket) {
      bucket.count += 1
    }
  }

  const max = Math.max(1, ...buckets.map(item => item.count))
  return buckets.map(item => ({ ...item, height: (item.count / max) * 100 }))
})

function refreshAll() {
  refreshStats()
  refreshAccess()
  refreshErrors()
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function isRead(row: Record<string, unknown>) {
  return Boolean(row.read_at)
}

function formatBytes(value: number) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = amount
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }

  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}
</script>

<style scoped>
.recent-error-card {
  border-color: color-mix(in srgb, var(--pb-card-border) 84%, transparent);
  background: var(--pb-card-bg);
}
</style>
