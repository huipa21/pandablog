<template>
  <section class="grid gap-4">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Tools</p>
      <h1 class="mt-1 text-3xl font-semibold text-[var(--pb-text)]">Access logs</h1>
    </header>

    <div class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
      <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        <UInput v-model="filters.from" type="datetime-local" label="From" />
        <UInput v-model="filters.to" type="datetime-local" label="To" />
        <UInput v-model="filters.path" placeholder="Path" />
        <UInput v-model="filters.search" placeholder="Search path or user agent" />
        <UInput v-model="filters.method" placeholder="Method" />
        <UInput v-model="filters.status" type="number" placeholder="Status" />
        <UInput v-model="filters.min_status" type="number" placeholder="Min status" />
        <UInput v-model="filters.max_status" type="number" placeholder="Max status" />
        <USelect v-model="filters.sort" :items="sortItems" />
        <USelect v-model="filters.limit" :items="limitItems" />
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <UButton icon="i-lucide-filter" @click="() => applyFilters()">Apply</UButton>
        <UButton color="neutral" variant="ghost" icon="i-lucide-eraser" @click="clearFilters">Clear</UButton>
        <UButton color="neutral" variant="outline" icon="i-lucide-download" @click="exportCsv">Export CSV</UButton>
      </div>
    </div>

    <div class="overflow-auto rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] shadow-[var(--pb-shadow-sm)]">
      <table class="min-w-full text-sm">
        <thead class="sticky top-0 bg-[var(--pb-surface-subtle)] text-left text-[var(--pb-text-muted)]">
          <tr>
            <th class="px-3 py-2">Time</th>
            <th class="px-3 py-2">Method</th>
            <th class="px-3 py-2">Path</th>
            <th class="px-3 py-2">Status</th>
            <th class="px-3 py-2">Duration</th>
            <th class="px-3 py-2">IP</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="pending">
            <td colspan="6" class="px-3 py-6"><USkeleton class="h-6" /></td>
          </tr>
          <tr v-else-if="!rows.length">
            <td colspan="6" class="px-3 py-6 text-center text-[var(--pb-text-subtle)]">No access logs for current filter.</td>
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

    <div class="flex items-center justify-between rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-3 shadow-[var(--pb-shadow-sm)]">
      <p class="text-sm text-[var(--pb-text-muted)]">Total: {{ total }}</p>
      <div class="flex gap-2">
        <UButton size="sm" color="neutral" :disabled="offset <= 0" @click="prevPage">Previous</UButton>
        <UButton size="sm" color="neutral" :disabled="offset + limit >= total" @click="nextPage">Next</UButton>
      </div>
    </div>

    <div v-if="selectedRow" class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-[var(--pb-text)]">Log details</h2>
        <UButton size="xs" color="neutral" variant="ghost" @click="copySelected">Copy JSON</UButton>
      </div>
      <pre class="overflow-auto rounded bg-stone-950 p-3 text-xs text-stone-100">{{ JSON.stringify(selectedRow, null, 2) }}</pre>
    </div>
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', adminWide: true })

const route = useRoute()
const router = useRouter()
const limitItems = [25, 50, 100, 200]
const sortItems = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' }
]

const filters = reactive({
  from: asDateTimeLocal(route.query.from),
  to: asDateTimeLocal(route.query.to),
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

const fetchQuery = computed(() => ({ ...route.query }))
const untypedFetch = $fetch as any
const { data, pending, refresh } = await useAsyncData(
  'admin-access-logs-list',
  () => untypedFetch('/api/admin/logs/access', { query: fetchQuery.value as Record<string, string> }),
  { watch: [fetchQuery] }
)

const rows = computed(() => Array.isArray((data.value as any)?.rows) ? (data.value as any).rows : [])
const total = computed(() => Number((data.value as any)?.total ?? 0))
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
})

function applyFilters(nextOffset = 0) {
  router.replace({
    query: cleanQuery({
      from: toIso(filters.from),
      to: toIso(filters.to),
      path: filters.path,
      search: filters.search,
      method: filters.method,
      status: filters.status,
      min_status: filters.min_status,
      max_status: filters.max_status,
      sort: filters.sort,
      limit: String(filters.limit),
      offset: String(nextOffset)
    })
  })
  refresh()
}

function clearFilters() {
  filters.from = ''
  filters.to = ''
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

function nextPage() {
  applyFilters(offset.value + limit.value)
}

function prevPage() {
  applyFilters(Math.max(0, offset.value - limit.value))
}

async function exportCsv() {
  const query: Record<string, string> = {
    ...Object.fromEntries(Object.entries(route.query).map(([key, value]) => [key, String(value ?? '')])),
    format: 'csv',
    limit: '10000',
    offset: '0'
  }
  const csv = await untypedFetch('/api/admin/logs/access/export', { query, responseType: 'text' })
  downloadBlob(String(csv), 'access-logs.csv', 'text/csv;charset=utf-8')
}

async function copySelected() {
  if (!selectedRow.value) {
    return
  }
  await navigator.clipboard.writeText(JSON.stringify(selectedRow.value, null, 2))
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

function asDateTimeLocal(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return ''
  }

  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function toIso(value: string) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return date.toISOString()
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
