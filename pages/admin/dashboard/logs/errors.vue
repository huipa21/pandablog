<template>
  <section class="grid gap-4">
    <header class="flex items-start justify-between gap-3">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.logs.tools') }}</p>
        <h1 class="mt-1 text-3xl font-semibold text-[var(--pb-text)]">{{ t('admin.logs.groups.title') }}</h1>
      </div>
      <UButton to="/admin/dashboard/logs" color="neutral" variant="ghost" icon="i-lucide-arrow-left">{{ t('admin.common.back') }}</UButton>
    </header>

    <div class="pb-admin-surface grid gap-3 p-4">
      <div class="flex flex-wrap gap-2" role="tablist" :aria-label="t('admin.logs.status')">
        <UButton v-for="tab in tabs" :key="tab.value" role="tab" :aria-selected="filters.status === tab.value" :variant="filters.status === tab.value ? 'solid' : 'ghost'" @click="changeStatus(tab.value)">{{ tab.label }}</UButton>
      </div>
      <div class="grid gap-3 md:grid-cols-3">
        <UInput v-model="filters.search" :placeholder="t('admin.logs.groups.search')" :aria-label="t('admin.logs.groups.search')" />
        <UInput v-model="filters.from" type="datetime-local" :aria-label="t('admin.logs.groups.from')" />
        <UInput v-model="filters.to" type="datetime-local" :aria-label="t('admin.logs.groups.to')" />
        <USelect v-model="filters.sort" :items="sortItems" :aria-label="t('admin.logs.groups.sort')" />
        <USelect v-model="filters.limit" :items="[25, 50, 100, 200]" :aria-label="t('admin.logs.groups.pageSize')" />
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton icon="i-lucide-filter" @click="applyFilters(0)">{{ t('admin.logs.apply') }}</UButton>
        <UButton color="neutral" variant="ghost" @click="clearFilters">{{ t('admin.common.clear') }}</UButton>
        <UButton color="neutral" variant="outline" :loading="pending" @click="refresh()">{{ t('admin.logs.refresh') }}</UButton>
        <UButton color="neutral" variant="outline" @click="exportCsv">{{ t('admin.logs.exportCsv') }}</UButton>
        <UBadge v-if="selectedIds.length" color="neutral">{{ t('admin.logs.selected', { count: selectedIds.length }) }}</UBadge>
        <UDropdownMenu v-if="selectedIds.length" :items="bulkItems">
          <UButton :loading="processing" :disabled="processing" color="neutral" variant="soft">{{ t('admin.common.actions') }}</UButton>
        </UDropdownMenu>
      </div>
      <p class="text-xs text-[var(--pb-text-muted)]">{{ t('admin.logs.groups.exportHint') }}</p>
    </div>

    <UAlert v-if="error" color="error" :title="t('admin.logs.groups.loadFailed')" />
    <div class="pb-admin-surface overflow-hidden">
      <div class="overflow-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-[var(--pb-surface-subtle)] text-left text-[var(--pb-text-muted)]">
            <tr>
              <th class="px-3 py-2"><input type="checkbox" :checked="allSelected" :indeterminate.prop="someSelected" :aria-label="t('admin.logs.selectAllErrors')" @change="toggleAll"></th>
              <th class="px-3 py-2">{{ t('admin.logs.status') }}</th>
              <th class="px-3 py-2">{{ t('admin.logs.message') }}</th>
              <th class="px-3 py-2">{{ t('admin.logs.groups.count') }}</th>
              <th class="px-3 py-2">{{ t('admin.logs.groups.lastSeen') }}</th>
              <th class="px-3 py-2">{{ t('admin.logs.groups.firstSeen') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="pending"><td colspan="6" class="p-4"><USkeleton class="h-6" /></td></tr>
            <tr v-else-if="!rows.length"><td colspan="6" class="p-6 text-center text-[var(--pb-text-muted)]">{{ t('admin.logs.groups.empty') }}</td></tr>
            <tr v-for="row in rows" :key="String(row.fingerprint)" class="border-t border-[var(--pb-border)] hover:bg-[var(--pb-surface-subtle)]">
              <td class="px-3 py-2"><input v-model="selectedIds" type="checkbox" :value="String(row.fingerprint)" :aria-label="t('admin.logs.selectError', { message: row.message })"></td>
              <td class="px-3 py-2">
                <span class="inline-block h-2 w-2 rounded-full" :class="!row.read_at && !row.resolved_at ? 'bg-[var(--pb-link)]' : 'bg-[var(--pb-text-subtle)]'" />
                <span class="sr-only">{{ stateLabel(row) }}</span>
                <UBadge v-if="row.regressed" color="warning" variant="subtle">{{ t('admin.logs.groups.regressed') }}</UBadge>
                <UBadge v-if="row.resolved_at" color="neutral" variant="subtle">{{ t('admin.logs.groups.resolved') }}</UBadge>
              </td>
              <td class="px-3 py-2">
                <button class="text-left text-[var(--pb-text)] hover:underline" :class="{ 'font-semibold': !row.read_at }" @click="openGroup(String(row.fingerprint))">{{ row.normalized_message }}</button>
                <p class="text-xs text-[var(--pb-text-muted)]">{{ row.route }}</p>
              </td>
              <td class="px-3 py-2">{{ row.count }}</td>
              <td class="px-3 py-2" :title="String(row.last_seen)">{{ relativeTime(String(row.last_seen)) }}</td>
              <td class="px-3 py-2">{{ row.first_seen }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AdminLogPagination v-if="!pending && total > 0" :total="total" :limit="Number(data?.limit ?? 50)" :offset="Number(data?.offset ?? 0)" @page="applyFilters" />
    </div>

    <UModal v-model:open="detailOpen" :title="t('admin.logs.groups.details')" :description="String(detail?.group.message ?? '')" :ui="{ content: 'max-w-5xl' }">
      <template #body>
        <USkeleton v-if="detailPending" class="h-24" />
        <UAlert v-else-if="detailError" color="error" :title="t('admin.logs.groups.loadFailed')" />
        <div v-else-if="detail" class="grid gap-4">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge>{{ detail.group.status_code ?? '—' }}</UBadge>
            <span>{{ detail.group.count }} · {{ detail.group.first_seen }} → {{ detail.group.last_seen }}</span>
            <UButton v-for="action in detailActions" :key="action" size="xs" color="neutral" variant="outline" :loading="processing" @click="runAction(action, [String(detail.group.fingerprint)])">{{ actionLabel(action) }}</UButton>
          </div>
          <pre class="max-h-64 overflow-auto rounded-[var(--pb-radius-card-inner)] bg-[var(--pb-surface-subtle)] p-3 text-xs">{{ detail.group.last_stack || t('admin.logs.groups.noStack') }}</pre>
          <h3 class="font-semibold">{{ t('admin.logs.groups.timeline') }}</h3>
          <p class="text-xs text-[var(--pb-text-muted)]">{{ t('admin.logs.groups.sampleHint') }}</p>
          <div class="flex flex-wrap gap-2">
            <UBadge v-for="point in timeline" :key="point.day" color="neutral" variant="subtle">{{ point.day }} · {{ point.count }}</UBadge>
          </div>
          <div class="overflow-auto">
            <table class="min-w-full text-sm">
              <thead class="text-left text-[var(--pb-text-muted)]"><tr>
                <th class="p-2">{{ t('admin.logs.time') }}</th><th class="p-2">{{ t('admin.logs.groups.requestId') }}</th><th class="p-2">{{ t('admin.logs.method') }}</th><th class="p-2">{{ t('admin.logs.path') }}</th><th class="p-2">{{ t('admin.logs.status') }}</th>
              </tr></thead>
              <tbody><tr v-for="occurrence in detail.occurrences" :key="String(occurrence.id)" class="border-t border-[var(--pb-border)]">
                <td class="p-2"><button class="hover:underline" @click="openOccurrence(String(occurrence.id))">{{ occurrence.timestamp }}</button></td>
                <td class="p-2"><span class="break-all">{{ occurrence.request_id }}</span><UButton v-if="occurrence.request_id" size="xs" color="neutral" variant="ghost" icon="i-lucide-copy" :aria-label="t('admin.logs.groups.copyRequestId')" @click="copyRequestId(String(occurrence.request_id))" /></td>
                <td class="p-2">{{ occurrence.method }}</td><td class="p-2">{{ occurrence.path }}</td><td class="p-2">{{ occurrence.status_code }}</td>
              </tr></tbody>
            </table>
          </div>
          <p class="text-xs text-[var(--pb-text-muted)]">{{ t('admin.logs.groups.grepHint') }}</p>
        </div>
      </template>
    </UModal>
    <AdminLogDetailDialog :open="Boolean(selectedOccurrence)" :row="selectedOccurrence" @update:open="value => { if (!value) selectedOccurrence = null }" />
    <AdminConfirmActionDialog :open="deleteOpen" :title="t('admin.logs.groups.deleteTitle')" :description="t('admin.logs.groups.deleteHint')" :confirm-label="t('admin.logs.deleteSelected')" confirm-color="error" :loading="processing" @update:open="deleteOpen = $event" @cancel="deleteOpen = false" @confirm="deleteSelected" />
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const toast = useAdminToast()
const sessionFetch = useSessionFetch() as any
const filters = reactive({ status: 'unread', search: '', from: '', to: '', sort: 'last_seen', limit: 50 })
function localDate(value: unknown) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
watch(() => route.query, query => {
  Object.assign(filters, { status: ['unread', 'read', 'resolved', 'all'].includes(String(query.status)) ? String(query.status) : 'unread', search: String(query.search ?? ''), from: localDate(query.from), to: localDate(query.to), sort: ['count', 'first_seen'].includes(String(query.sort)) ? String(query.sort) : 'last_seen', limit: [25, 50, 100, 200].includes(Number(query.limit)) ? Number(query.limit) : 50 })
}, { immediate: true })
const fetchQuery = computed(() => Object.fromEntries(['status', 'search', 'from', 'to', 'sort', 'limit', 'offset'].filter(key => route.query[key] !== undefined).map(key => [key, route.query[key]])))
const { data, pending, error, refresh } = await useAsyncData<Record<string, any>>('admin-error-groups', () => sessionFetch('/api/admin/logs/error-groups', { query: fetchQuery.value }), { watch: [fetchQuery] })
const rows = computed<Array<Record<string, any>>>(() => data.value?.rows ?? [])
const total = computed(() => Number(data.value?.total ?? 0))
const selectedIds = ref<string[]>([])
const allSelected = computed(() => rows.value.length > 0 && rows.value.every(row => selectedIds.value.includes(String(row.fingerprint))))
const someSelected = computed(() => !allSelected.value && rows.value.some(row => selectedIds.value.includes(String(row.fingerprint))))
watch(fetchQuery, () => { selectedIds.value = []; deleteOpen.value = false })
const tabs = computed(() => [{ value: 'unread', label: t('admin.logs.unread') }, { value: 'all', label: t('admin.logs.groups.all') }, { value: 'resolved', label: t('admin.logs.groups.resolved') }])
const sortItems = computed(() => ['last_seen', 'count', 'first_seen'].map(value => ({ value, label: t(`admin.logs.groups.${{ last_seen: 'lastSeen', count: 'count', first_seen: 'firstSeen' }[value]}`) })))
type Action = 'mark_read' | 'mark_unread' | 'resolve' | 'unresolve' | 'delete'
const actionLabel = (action: Action) => t({ mark_read: 'admin.logs.markAsRead', mark_unread: 'admin.logs.markAsUnread', resolve: 'admin.logs.groups.resolve', unresolve: 'admin.logs.groups.unresolve', delete: 'admin.logs.deleteSelected' }[action])
const bulkItems = computed(() => (['mark_read', 'mark_unread', 'resolve', 'unresolve', 'delete'] as Action[]).map(action => ({ label: actionLabel(action), onSelect: () => action === 'delete' ? (deleteOpen.value = true) : runAction(action) })))
const processing = ref(false)
const deleteOpen = ref(false)
const detailOpen = ref(false)
const detailPending = ref(false)
const detailError = ref(false)
const detail = ref<{ group: Record<string, any>; occurrences: Array<Record<string, any>> } | null>(null)
const detailActions = computed<Action[]>(() => detail.value?.group.resolved_at ? ['unresolve'] : [detail.value?.group.read_at ? 'mark_unread' : 'mark_read', 'resolve'])
const timeline = computed(() => {
  const counts = new Map<string, number>()
  for (const row of detail.value?.occurrences ?? []) { const day = String(row.timestamp).slice(0, 10); counts.set(day, (counts.get(day) ?? 0) + 1) }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count }))
})
const selectedOccurrence = ref<Record<string, unknown> | null>(null)
let detailRequest = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
let clockTimer: ReturnType<typeof setInterval> | undefined
const clock = useState('error-inbox-clock', () => Date.now())
watch(() => filters.search, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (value === String(route.query.search ?? '')) return
  searchTimer = setTimeout(() => { void applyFilters(0) }, 300)
})
onMounted(() => {
  clockTimer = setInterval(() => { clock.value = Date.now() }, 60_000)
  if (typeof route.query.group === 'string' && /^[a-f0-9]{16}$/.test(route.query.group)) void openGroup(route.query.group)
})
onBeforeUnmount(() => { clearTimeout(searchTimer); clearInterval(clockTimer); detailRequest++ })
async function applyFilters(offset = 0) {
  clearTimeout(searchTimer)
  const query: Record<string, string> = { status: filters.status, sort: filters.sort, limit: String(filters.limit), offset: String(offset) }
  if (filters.search.trim()) query.search = filters.search.trim()
  if (filters.from) query.from = new Date(filters.from).toISOString()
  if (filters.to) query.to = new Date(filters.to).toISOString()
  await router.replace({ query })
}
function clearFilters() { Object.assign(filters, { status: 'unread', search: '', from: '', to: '', sort: 'last_seen', limit: 50 }); void applyFilters(0) }
function changeStatus(status: string) { filters.status = status; void applyFilters(0) }
function toggleAll(event: Event) { selectedIds.value = (event.target as HTMLInputElement).checked ? rows.value.map(row => String(row.fingerprint)) : [] }
function stateLabel(row: Record<string, any>) { return row.resolved_at ? t('admin.logs.groups.resolved') : row.read_at ? t('admin.logs.read') : t('admin.logs.unread') }
function relativeTime(value: string) {
  const seconds = Math.round((Date.parse(value) - clock.value) / 1000)
  if (!Number.isFinite(seconds)) return value
  const unit = Math.abs(seconds) < 60 ? 'second' : Math.abs(seconds) < 3600 ? 'minute' : Math.abs(seconds) < 86400 ? 'hour' : 'day'
  return new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }).format(Math.round(seconds / { second: 1, minute: 60, hour: 3600, day: 86400 }[unit]), unit)
}
async function openGroup(fp: string) {
  const request = ++detailRequest
  detail.value = null; detailOpen.value = true; detailPending.value = true; detailError.value = false
  try { const result = await sessionFetch(`/api/admin/logs/error-groups/${fp}`); if (request === detailRequest) detail.value = result }
  catch { if (request === detailRequest) detailError.value = true }
  finally { if (request === detailRequest) detailPending.value = false }
}
async function runAction(action: Action, ids = selectedIds.value) {
  if (!ids.length || processing.value) return
  processing.value = true
  try {
    const response = await sessionFetch('/api/admin/logs/error-groups/bulk', { method: 'POST', body: { action, ids } })
    toast.success(t(action === 'delete' ? 'admin.logs.groups.deleted' : 'admin.logs.groups.updated', { count: response.deleted ?? response.updated ?? 0 }))
    selectedIds.value = []
    if (detail.value && ids.includes(String(detail.value.group.fingerprint))) {
      if (action === 'delete') { detailOpen.value = false; detail.value = null }
      else await openGroup(String(detail.value.group.fingerprint))
    }
    await refresh()
  } catch (error) { toast.error(error, t('admin.logs.bulk.failed')) }
  finally { processing.value = false }
}
async function deleteSelected() { await runAction('delete'); deleteOpen.value = false }
async function openOccurrence(id: string) {
  try { selectedOccurrence.value = (await sessionFetch(`/api/admin/logs/errors/${encodeURIComponent(id)}`)).record }
  catch (error) { toast.error(error, t('admin.logs.groups.loadFailed')) }
}
async function copyRequestId(id: string) {
  try { await navigator.clipboard.writeText(id); toast.success(t('admin.logs.groups.copied')) }
  catch (error) { toast.error(error, t('admin.logs.groups.copyFailed')) }
}
async function exportCsv() {
  try {
    const { status: _status, sort: _sort, ...query } = fetchQuery.value
    const csv = await sessionFetch('/api/admin/logs/errors/export', { query: { ...query, format: 'csv', sort: 'newest', limit: '10000', offset: '0' }, responseType: 'text' })
    const url = URL.createObjectURL(new Blob([String(csv)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'error-occurrences.csv'; link.click(); URL.revokeObjectURL(url)
  } catch (error) { toast.error(error, t('admin.logs.groups.loadFailed')) }
}
</script>
