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

    <div class="grid gap-4 md:grid-cols-3">
      <NuxtLink to="/admin/dashboard/logs/activity" class="block rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)] transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)] focus-visible:outline-none focus-visible:shadow-[var(--pb-focus-ring)]">
        <p class="text-xs uppercase tracking-wider text-[var(--pb-text-subtle)]">{{ t('admin.logs.activityLogs') }}</p>
        <p class="mt-2 text-2xl font-semibold text-[var(--pb-text)]">{{ stats?.activity.count ?? '—' }}</p>
      </NuxtLink>
      <NuxtLink to="/admin/dashboard/logs/errors" class="block rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)] transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)] focus-visible:outline-none focus-visible:shadow-[var(--pb-focus-ring)]">
        <p class="text-xs uppercase tracking-wider text-[var(--pb-text-subtle)]">{{ t('admin.logs.groups.unreadCount') }}</p>
        <p class="mt-2 text-2xl font-semibold text-[var(--pb-text)]">{{ stats?.errors.unread_groups ?? '—' }}</p>
      </NuxtLink>
      <div class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
        <p class="text-xs uppercase tracking-wider text-[var(--pb-text-subtle)]">{{ t('admin.logs.storage') }}</p>
        <p class="mt-2 text-2xl font-semibold text-[var(--pb-text)]">{{ stats ? formatBytes(stats.db_estimate_bytes ?? 0) : '—' }}</p>
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
            <p class="min-w-0 text-sm text-[var(--pb-text)]" :class="isRead(row) ? 'font-medium' : 'font-semibold'"><NuxtLink :to="{ path: '/admin/dashboard/logs/errors', query: { group: asText(row.fingerprint) } }">{{ asText(row.normalized_message) || asText(row.message) }}</NuxtLink></p>
            <UBadge :color="isRead(row) ? 'neutral' : 'primary'" variant="subtle">{{ isRead(row) ? t('admin.logs.read') : t('admin.logs.unread') }}</UBadge>
          </div>
          <p class="mt-1 break-all text-xs text-[var(--pb-text-muted)]">{{ asText(row.last_seen) }} · {{ asText(row.route) }} · {{ row.count }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const sessionFetch = useSessionFetch()

const { data: statsData, pending: statsPending, error, refresh: refreshStats } = await useAsyncData(
  'admin-log-stats',
  () => sessionFetch('/api/admin/logs/stats')
)
const { data: errorData, pending: errorPending, refresh: refreshErrors } = await useAsyncData(
  'admin-log-errors-recent',
  () => sessionFetch('/api/admin/logs/error-groups', { query: { status: 'unread', limit: 5, sort: 'last_seen' } })
)

const stats = computed(() => statsData.value as any)
const recentErrors = computed(() => Array.isArray((errorData.value as any)?.rows) ? (errorData.value as any).rows : [])
const pending = computed(() => statsPending.value || errorPending.value)

function refreshAll() {
  refreshStats()
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
