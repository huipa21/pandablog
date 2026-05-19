<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-teal-700">Logs</p>
      <h1 class="mt-1 text-3xl font-semibold text-stone-950">Logging dashboard</h1>
      <p class="mt-2 text-sm text-stone-600">Operational overview for access, activity, and errors.</p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load log dashboard" />

    <div class="grid gap-4 md:grid-cols-4">
      <div class="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <p class="text-xs uppercase tracking-wider text-stone-500">Access logs</p>
        <p class="mt-2 text-2xl font-semibold text-stone-900">{{ stats?.access.count ?? 0 }}</p>
      </div>
      <div class="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <p class="text-xs uppercase tracking-wider text-stone-500">Activity logs</p>
        <p class="mt-2 text-2xl font-semibold text-stone-900">{{ stats?.activity.count ?? 0 }}</p>
      </div>
      <div class="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <p class="text-xs uppercase tracking-wider text-stone-500">Error logs</p>
        <p class="mt-2 text-2xl font-semibold text-stone-900">{{ stats?.errors.count ?? 0 }}</p>
      </div>
      <div class="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <p class="text-xs uppercase tracking-wider text-stone-500">DB estimate</p>
        <p class="mt-2 text-2xl font-semibold text-stone-900">{{ formatBytes(stats?.estimate_bytes ?? 0) }}</p>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <div class="rounded-lg border border-stone-200 bg-white p-4 shadow-sm lg:col-span-2">
        <h2 class="text-sm font-semibold text-stone-900">Requests per hour (last 24h)</h2>
        <div class="mt-4 flex h-44 items-end gap-1 rounded bg-stone-50 px-2 py-3">
          <div
            v-for="(point, index) in hourlyPoints"
            :key="index"
            class="flex-1 rounded-t bg-teal-500/70"
            :title="`${point.label}: ${point.count}`"
            :style="{ height: `${Math.max(6, point.height)}%` }"
          />
        </div>
      </div>

      <div class="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <h2 class="text-sm font-semibold text-stone-900">Quick links</h2>
        <div class="mt-3 grid gap-2">
          <UButton to="/admin/logs/access" color="neutral" variant="subtle" block icon="i-lucide-globe">Access logs</UButton>
          <UButton to="/admin/logs/activity" color="neutral" variant="subtle" block icon="i-lucide-notebook-pen">Activity logs</UButton>
          <UButton to="/admin/logs/errors" color="neutral" variant="subtle" block icon="i-lucide-triangle-alert">Error logs</UButton>
          <UButton to="/admin/logs/settings" color="neutral" variant="subtle" block icon="i-lucide-settings-2">Logging settings</UButton>
        </div>
      </div>
    </div>

    <div class="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-stone-900">Recent errors</h2>
        <UButton size="xs" variant="ghost" color="neutral" @click="refreshAll">Refresh</UButton>
      </div>

      <div v-if="pending" class="mt-3 grid gap-2">
        <USkeleton class="h-14" />
        <USkeleton class="h-14" />
      </div>

      <div v-else-if="!recentErrors.length" class="mt-3 rounded border border-dashed border-stone-300 p-4 text-sm text-stone-500">
        No error logs in the selected period.
      </div>

      <div v-else class="mt-3 grid gap-2">
        <article v-for="row in recentErrors" :key="String(row.id)" class="rounded border border-rose-200 bg-rose-50 p-3">
          <p class="text-sm font-semibold text-rose-700">{{ asText(row.message) }}</p>
          <p class="mt-1 text-xs text-rose-600">{{ asText(row.timestamp) }} · {{ asText(row.path) }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

const { data: statsData, pending: statsPending, error, refresh: refreshStats } = await useAsyncData(
  'admin-log-stats',
  () => $fetch('/api/admin/logs/stats')
)
const { data: accessData, pending: accessPending, refresh: refreshAccess } = await useAsyncData(
  'admin-log-access-24h',
  () => $fetch('/api/admin/logs/access', { query: { from, limit: 200, sort: 'newest' } })
)
const { data: errorData, pending: errorPending, refresh: refreshErrors } = await useAsyncData(
  'admin-log-errors-recent',
  () => $fetch('/api/admin/logs/errors', { query: { from, limit: 5, sort: 'newest' } })
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
