<template>
  <section class="grid gap-4">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.logs.tools') }}</p>
        <h1 class="mt-1 text-3xl font-semibold text-[var(--pb-text)]">{{ t('admin.logs.accessLogs') }}</h1>
      </div>
      <UButton to="/admin/dashboard/logs" size="sm" color="neutral" variant="ghost" icon="i-lucide-arrow-left">{{ t('admin.common.back') }}</UButton>
    </header>

    <div class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
      <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        <UFormField :label="t('admin.logs.from') + ' (UTC)'">
          <UInput v-model="filters.from" type="datetime-local" step="0.001" :min="dateMin" :max="dateMax" />
        </UFormField>
        <UFormField :label="t('admin.logs.to') + ' (UTC)'">
          <UInput v-model="filters.to" type="datetime-local" step="0.001" :min="dateMin" :max="dateMax" />
        </UFormField>
        <UInput v-model="filters.path" :placeholder="t('admin.logs.path')" />
        <UInput v-model="filters.search" :placeholder="t('admin.logs.searchPathAgent')" />
        <UInput v-model="filters.method" :placeholder="t('admin.logs.method')" />
        <UInput v-model="filters.status" type="number" :placeholder="t('admin.logs.status')" />
        <UInput v-model="filters.min_status" type="number" :placeholder="t('admin.logs.minStatus')" />
        <UInput v-model="filters.max_status" type="number" :placeholder="t('admin.logs.maxStatus')" />
        <USelect v-model="filters.sort" :items="sortItems" />
        <USelect v-model="filters.limit" :items="limitItems" />
      </div>
      <p class="mt-3 text-xs text-[var(--pb-text-muted)]">{{ t('admin.logs.accessDateRangeHint', { days: retentionDays }) }}</p>
      <UAlert v-if="settingsError" class="mt-3" color="warning" icon="i-lucide-triangle-alert" :title="t('admin.logs.settings.loadFailed')" />
      <div class="mt-3 flex flex-wrap gap-2">
        <UButton icon="i-lucide-filter" @click="() => applyFilters()">{{ t('admin.logs.apply') }}</UButton>
        <UButton color="neutral" variant="ghost" icon="i-lucide-eraser" @click="clearFilters">{{ t('admin.common.clear') }}</UButton>
        <UButton color="neutral" variant="outline" icon="i-lucide-download" @click="exportCsv">{{ t('admin.logs.exportCsv') }}</UButton>
      </div>
    </div>

    <UAlert v-if="!pending && truncated" color="warning" icon="i-lucide-triangle-alert" :title="t('admin.logs.accessResultsTruncated')" />

    <div class="overflow-hidden rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] shadow-[var(--pb-shadow-sm)]">
      <div class="overflow-auto">
        <table class="min-w-full text-sm">
        <thead class="sticky top-0 bg-[var(--pb-surface-subtle)] text-left text-[var(--pb-text-muted)]">
          <tr>
            <th class="px-3 py-2">{{ t('admin.logs.time') }}</th>
            <th class="px-3 py-2">{{ t('admin.logs.method') }}</th>
            <th class="px-3 py-2">{{ t('admin.logs.path') }}</th>
            <th class="px-3 py-2">{{ t('admin.logs.status') }}</th>
            <th class="px-3 py-2">{{ t('admin.logs.duration') }}</th>
            <th class="px-3 py-2">{{ t('admin.logs.ip') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="pending">
            <td colspan="6" class="px-3 py-6"><USkeleton class="h-6" /></td>
          </tr>
          <tr v-else-if="!rows.length">
            <td colspan="6" class="px-3 py-6 text-center text-[var(--pb-text-subtle)]">{{ t('admin.logs.emptyAccess') }}</td>
          </tr>
          <tr
            v-for="row in rows"
            :key="String(row.id)"
            class="cursor-pointer border-t border-[var(--pb-divider)] hover:bg-[var(--pb-card-bg-hover)]"
            :class="Number(row.status_code) >= 500 ? 'bg-rose-50/60' : Number(row.status_code) >= 400 ? 'bg-amber-50/60' : ''"
            @click="selectedRow = row"
          >
            <td class="px-3 py-2">{{ text(row.timestamp) }}</td>
            <td class="px-3 py-2">{{ text(row.method) }}</td>
            <td class="px-3 py-2">{{ text(row.path) }}</td>
            <td class="px-3 py-2">{{ Number(row.status_code) }}</td>
            <td class="px-3 py-2">{{ Number(row.response_time_ms) }}ms</td>
            <td class="px-3 py-2">{{ text(row.ip) }}</td>
          </tr>
        </tbody>
        </table>
      </div>
      <AdminLogPagination v-if="!pending && (total > 0 || truncated)" :total="total" :limit="limit" :offset="offset" :truncated="truncated" @page="goToOffset" />
    </div>

    <AdminLogDetailDialog :open="Boolean(selectedRow)" :row="selectedRow" @update:open="(value) => { if (!value) selectedRow = null }" />
  </section>
</template>

<script setup lang="ts">
import type { LocationQueryRaw } from 'vue-router'
import type { LoggingSettings } from '~/types/logging'
import { accessLogDateWindow, accessLogPickerIso, accessLogPickerValue } from '~/utils/loggingAccessUi'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const limitItems = [25, 50, 100, 200]
const sortItems = computed(() => [
  { label: t('admin.logs.newest'), value: 'newest' },
  { label: t('admin.logs.oldest'), value: 'oldest' }
])

const untypedFetch = useSessionFetch() as any
const windowNow = useState('admin-access-logs-now', () => new Date().toISOString())
const { data: settingsData, error: settingsError } = await useAsyncData(
  'admin-access-log-retention-settings',
  () => untypedFetch('/api/admin/settings/logging') as Promise<{ settings: LoggingSettings }>
)
const retentionDays = computed(() => Number(settingsData.value?.settings.retention_access_days ?? 30))
const dateWindow = computed(() => accessLogDateWindow(route.query, retentionDays.value, new Date(windowNow.value)))
const dateMin = computed(() => accessLogPickerValue(dateWindow.value.min))
const dateMax = computed(() => accessLogPickerValue(dateWindow.value.max))

const filters = reactive({
  from: accessLogPickerValue(dateWindow.value.from),
  to: accessLogPickerValue(dateWindow.value.to),
  path: asText(route.query.path),
  search: asText(route.query.search),
  method: asText(route.query.method),
  status: asText(route.query.status),
  min_status: asText(route.query.min_status),
  max_status: asText(route.query.max_status),
  sort: route.query.sort === 'oldest' ? 'oldest' : 'newest',
  limit: [25, 50, 100, 200].includes(Number(route.query.limit)) ? Number(route.query.limit) : 50,
  offset: Number(route.query.offset ?? 0)
})

// Always send explicit dates (including initial load and export), not the reader's 7-day default.
const fetchQuery = computed(() => ({ ...route.query, from: dateWindow.value.from, to: dateWindow.value.to, total: 'true' }))
watch(dateWindow, (value) => {
  filters.from = accessLogPickerValue(value.from)
  filters.to = accessLogPickerValue(value.to)
})
const { data, pending, refresh } = await useAsyncData(
  'admin-access-logs-list',
  () => untypedFetch('/api/admin/logs/access', { query: fetchQuery.value as Record<string, string> }),
  { watch: [fetchQuery] }
)

const rows = computed(() => Array.isArray((data.value as any)?.rows) ? (data.value as any).rows : [])
const total = computed(() => Number((data.value as any)?.total ?? 0))
const truncated = computed(() => (data.value as any)?.truncated === true)
const limit = computed(() => Number((data.value as any)?.limit ?? filters.limit))
const offset = computed(() => Number((data.value as any)?.offset ?? filters.offset))
const selectedRow = ref<Record<string, unknown> | null>(null)

let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(() => filters.search, () => {
  if (searchDebounce) {
    clearTimeout(searchDebounce)
  }

  searchDebounce = setTimeout(() => {
    applyFilters()
  }, 300)
}, { flush: 'sync' })
onBeforeUnmount(() => {
  if (searchDebounce) clearTimeout(searchDebounce)
  clearNuxtState('admin-access-logs-now')
})

async function applyFilters(nextOffset = 0) {
  if (searchDebounce) clearTimeout(searchDebounce)
  const window = accessLogDateWindow({ from: accessLogPickerIso(filters.from), to: accessLogPickerIso(filters.to) }, retentionDays.value, new Date(windowNow.value))
  filters.from = accessLogPickerValue(window.from)
  filters.to = accessLogPickerValue(window.to)
  await replaceQuery(cleanQuery({
    from: window.from,
    to: window.to,
    path: filters.path,
    search: filters.search,
    method: filters.method,
    status: filters.status,
    min_status: filters.min_status,
    max_status: filters.max_status,
    sort: filters.sort,
    limit: String(filters.limit),
    offset: String(nextOffset)
  }))
}

async function replaceQuery(query: LocationQueryRaw) {
  if (Object.keys(query).length === Object.keys(route.query).length && Object.entries(query).every(([key, value]) => route.query[key] === value)) {
    await refresh()
  } else {
    await router.replace({ query })
  }
}

function clearFilters() {
  windowNow.value = new Date().toISOString()
  const window = accessLogDateWindow({}, retentionDays.value, new Date(windowNow.value))
  filters.from = accessLogPickerValue(window.from)
  filters.to = accessLogPickerValue(window.to)
  filters.path = ''
  filters.search = ''
  filters.method = ''
  filters.status = ''
  filters.min_status = ''
  filters.max_status = ''
  filters.sort = 'newest'
  filters.limit = 50
  applyFilters(0)
}

function goToOffset(nextOffset: number) {
  // Paging uses the applied window/filters, not unsubmitted edits in the form.
  replaceQuery({ ...fetchQuery.value, offset: String(nextOffset) })
}

async function exportCsv() {
  const query: Record<string, string> = {
    ...Object.fromEntries(Object.entries(fetchQuery.value).map(([key, value]) => [key, String(value ?? '')])),
    format: 'csv',
    limit: '10000',
    offset: '0'
  }
  const csv = await untypedFetch('/api/admin/logs/access/export', { query, responseType: 'text' })
  downloadBlob(String(csv), 'access-logs.csv', 'text/csv;charset=utf-8')
}

function cleanQuery(value: Record<string, string>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== ''))
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function downloadBlob(content: string, fileName: string, contentType: string) {
  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>
