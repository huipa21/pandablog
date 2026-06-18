<template>
  <section class="grid gap-4">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.logs.tools') }}</p>
        <h1 class="mt-1 text-3xl font-semibold text-[var(--pb-text)]">{{ t('admin.logs.errorLogs') }}</h1>
      </div>
      <UButton to="/admin/dashboard/logs" size="sm" color="neutral" variant="ghost" icon="i-lucide-arrow-left">{{ t('admin.common.back') }}</UButton>
    </header>

    <div class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
      <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        <UInput v-model="filters.from" type="datetime-local" />
        <UInput v-model="filters.to" type="datetime-local" />
        <UInput v-model="filters.level" :placeholder="t('admin.logs.level')" />
        <UInput v-model="filters.search" :placeholder="t('admin.logs.searchMessageStack')" />
        <USelect v-model="filters.sort" :items="sortItems" />
        <USelect v-model="filters.limit" :items="limitItems" />
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <UButton icon="i-lucide-filter" @click="() => applyFilters()">{{ t('admin.logs.apply') }}</UButton>
        <UButton color="neutral" variant="ghost" icon="i-lucide-eraser" @click="clearFilters">{{ t('admin.common.clear') }}</UButton>
        <UButton color="neutral" variant="outline" icon="i-lucide-download" @click="exportCsv">{{ t('admin.logs.exportCsv') }}</UButton>
        <UBadge v-if="selectedIds.length" color="neutral" variant="subtle">{{ t('admin.logs.selected', { count: selectedIds.length }) }}</UBadge>
        <UDropdownMenu v-if="selectedIds.length" :items="bulkActionItems">
          <UButton color="neutral" variant="soft" icon="i-lucide-list-checks" :loading="bulkProcessing" :disabled="bulkProcessing">
            {{ t('admin.common.actions') }}
          </UButton>
        </UDropdownMenu>
      </div>
    </div>

    <div class="pb-admin-surface overflow-hidden">
      <div class="overflow-auto">
        <table class="min-w-full text-sm">
        <thead class="sticky top-0 bg-[var(--pb-surface-subtle)] text-left text-[var(--pb-text-muted)]">
          <tr>
            <th class="w-12 px-3 py-2">
              <input
                type="checkbox"
                class="rounded border-[var(--pb-border-strong)]"
                :checked="allVisibleSelected"
                :indeterminate.prop="someVisibleSelected"
                :aria-label="t('admin.logs.selectAllErrors')"
                @click.stop
                @change="toggleSelectAll"
              >
            </th>
            <th class="px-3 py-2">{{ t('admin.logs.time') }}</th>
            <th class="px-3 py-2">{{ t('admin.logs.level') }}</th>
            <th class="px-3 py-2">{{ t('admin.logs.status') }}</th>
            <th class="px-3 py-2">{{ t('admin.logs.message') }}</th>
            <th class="px-3 py-2">{{ t('admin.logs.path') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="pending">
            <td colspan="6" class="px-3 py-6"><USkeleton class="h-6" /></td>
          </tr>
          <tr v-else-if="!rows.length">
            <td colspan="6" class="px-3 py-6 text-center text-[var(--pb-text-subtle)]">{{ t('admin.logs.emptyErrors') }}</td>
          </tr>
          <tr
            v-for="row in rows"
            :key="String(row.id)"
            class="cursor-pointer border-t border-[var(--pb-border)] bg-[var(--pb-card-bg)] hover:bg-[var(--pb-surface-subtle)]"
            :class="{ 'pb-selected-surface': isSelected(row) }"
            @click="selectedRow = row"
          >
            <td class="px-3 py-2 align-top" @click.stop>
              <input v-model="selectedIds" type="checkbox" :value="rowId(row)" class="rounded border-[var(--pb-border-strong)]" :aria-label="t('admin.logs.selectError', { message: text(row.message) })">
            </td>
            <td class="px-3 py-2">{{ text(row.timestamp) }}</td>
            <td class="px-3 py-2">{{ text(row.level) }}</td>
            <td class="px-3 py-2">
              <UBadge :color="isRead(row) ? 'neutral' : 'primary'" variant="subtle">
                {{ isRead(row) ? t('admin.logs.read') : t('admin.logs.unread') }}
              </UBadge>
            </td>
            <td class="px-3 py-2" :class="isRead(row) ? 'text-[var(--pb-text-muted)]' : 'font-medium text-[var(--pb-text)]'">{{ text(row.message) }}</td>
            <td class="px-3 py-2 text-[var(--pb-text-muted)]">{{ text(row.path) }}</td>
          </tr>
        </tbody>
        </table>
      </div>
      <AdminLogPagination v-if="!pending && total > 0" :total="total" :limit="limit" :offset="offset" @page="goToOffset" />
    </div>

    <AdminLogDetailDialog :open="Boolean(selectedRow)" :row="selectedRow" @update:open="(value) => { if (!value) selectedRow = null }" />

    <AdminConfirmActionDialog
      :open="confirmDialog.open"
      :title="confirmDialog.title"
      :description="confirmDialog.description"
      :confirm-label="confirmDialog.confirmLabel"
      confirm-color="error"
      :loading="bulkProcessing"
      @update:open="(value) => { if (!value) closeConfirmDialog() }"
      @cancel="closeConfirmDialog"
      @confirm="confirmDeleteSelected"
    />
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const adminToast = useAdminToast()
type ErrorLogRow = Record<string, unknown>
const limitItems = [25, 50, 100, 200]
const sortItems = computed(() => [
  { label: t('admin.logs.newest'), value: 'newest' },
  { label: t('admin.logs.oldest'), value: 'oldest' }
])

const filters = reactive({
  from: asDateTimeLocal(route.query.from),
  to: asDateTimeLocal(route.query.to),
  level: asText(route.query.level),
  search: asText(route.query.search),
  sort: route.query.sort === 'oldest' ? 'oldest' : 'newest',
  limit: [25, 50, 100, 200].includes(Number(route.query.limit)) ? Number(route.query.limit) : 50,
  offset: Number(route.query.offset ?? 0)
})

const fetchQuery = computed(() => ({ ...route.query }))
const untypedFetch = useSessionFetch() as any
const { data, pending, refresh } = await useAsyncData(
  'admin-error-logs-list',
  () => untypedFetch('/api/admin/logs/errors', { query: fetchQuery.value }),
  { watch: [fetchQuery] }
)

const rows = computed<ErrorLogRow[]>(() => Array.isArray((data.value as any)?.rows) ? (data.value as any).rows : [])
const total = computed(() => Number((data.value as any)?.total ?? 0))
const limit = computed(() => Number((data.value as any)?.limit ?? filters.limit))
const offset = computed(() => Number((data.value as any)?.offset ?? filters.offset))
const selectedRow = ref<ErrorLogRow | null>(null)
const selectedIds = ref<string[]>([])
const bulkProcessing = ref(false)
const confirmDialog = reactive({
  open: false,
  title: '',
  description: '',
  confirmLabel: '',
  ids: [] as string[]
})
const allVisibleSelected = computed(() => rows.value.length > 0 && rows.value.every((row) => selectedIds.value.includes(rowId(row))))
const someVisibleSelected = computed(() => !allVisibleSelected.value && rows.value.some((row) => selectedIds.value.includes(rowId(row))))
const selectedRows = computed(() => rows.value.filter((row) => selectedIds.value.includes(rowId(row))))
const hasUnreadSelection = computed(() => selectedRows.value.some((row) => !isRead(row)))
const hasReadSelection = computed(() => selectedRows.value.some((row) => isRead(row)))
const bulkActionItems = computed(() => [[
  {
    label: t('admin.logs.markAsRead'),
    icon: 'i-lucide-mail-open',
    disabled: !hasUnreadSelection.value,
    onSelect: () => runBulkAction('mark_read')
  },
  {
    label: t('admin.logs.markAsUnread'),
    icon: 'i-lucide-mail',
    disabled: !hasReadSelection.value,
    onSelect: () => runBulkAction('mark_unread')
  },
  {
    label: t('admin.logs.deleteSelected'),
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onSelect: openDeleteConfirm
  }
]])

let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(() => filters.search, () => {
  if (searchDebounce) {
    clearTimeout(searchDebounce)
  }

  searchDebounce = setTimeout(() => {
    applyFilters()
  }, 300)
})

async function applyFilters(nextOffset = 0) {
  selectedIds.value = []
  closeConfirmDialog()
  await router.replace({
    query: cleanQuery({
      from: toIso(filters.from),
      to: toIso(filters.to),
      level: filters.level,
      search: filters.search,
      sort: filters.sort,
      limit: String(filters.limit),
      offset: String(nextOffset)
    })
  })
  await refresh()
}

function clearFilters() {
  filters.from = ''
  filters.to = ''
  filters.level = ''
  filters.search = ''
  filters.sort = 'newest'
  filters.limit = 50
  applyFilters(0)
}

function goToOffset(nextOffset: number) {
  applyFilters(nextOffset)
}

function toggleSelectAll(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  const visibleIds = rows.value.map(rowId)

  if (checked) {
    selectedIds.value = Array.from(new Set([...selectedIds.value, ...visibleIds]))
    return
  }

  const visibleIdSet = new Set(visibleIds)
  selectedIds.value = selectedIds.value.filter((id) => !visibleIdSet.has(id))
}

function openDeleteConfirm() {
  const ids = Array.from(new Set(selectedIds.value))
  if (!ids.length) {
    return
  }

  const count = ids.length
  confirmDialog.open = true
  confirmDialog.title = t(count === 1 ? 'admin.logs.bulk.deleteOneTitle' : 'admin.logs.bulk.deleteManyTitle', { count })
  confirmDialog.description = t('admin.logs.bulk.deleteDescription')
  confirmDialog.confirmLabel = t(count === 1 ? 'admin.logs.bulk.deleteOneConfirm' : 'admin.logs.bulk.deleteManyConfirm', { count })
  confirmDialog.ids = ids
}

function closeConfirmDialog() {
  if (bulkProcessing.value) {
    return
  }

  confirmDialog.open = false
  confirmDialog.ids = []
}

async function confirmDeleteSelected() {
  if (!confirmDialog.ids.length) {
    closeConfirmDialog()
    return
  }

  await runBulkAction('delete', confirmDialog.ids)
  closeConfirmDialog()
}

async function runBulkAction(action: 'mark_read' | 'mark_unread' | 'delete', explicitIds?: string[]) {
  const ids = Array.from(new Set(explicitIds ?? selectedIds.value))
  if (!ids.length) {
    return
  }

  bulkProcessing.value = true
  try {
    const response = await $fetch<{
      updated?: number
      deleted?: number
      updated_ids?: string[]
      deleted_ids?: string[]
    }>('/api/admin/logs/errors/bulk', {
      method: 'POST',
      body: { action, ids }
    })

    const changedIds = new Set([...(response.updated_ids ?? []), ...(response.deleted_ids ?? [])])
    selectedIds.value = selectedIds.value.filter((id) => !changedIds.has(id))
    const count = response.deleted ?? response.updated ?? changedIds.size
    adminToast.success(t(action === 'delete' ? 'admin.logs.bulk.deleted' : 'admin.logs.bulk.updated', { count }))
    await refresh()
  } catch (error: any) {
    adminToast.error(error, t('admin.logs.bulk.failed'))
  } finally {
    bulkProcessing.value = false
  }
}

async function exportCsv() {
  const query = {
    ...route.query,
    format: 'csv',
    limit: '10000',
    offset: '0'
  }
  const csv = await untypedFetch('/api/admin/logs/errors/export', { query, responseType: 'text' })
  downloadBlob(String(csv), 'error-logs.csv', 'text/csv;charset=utf-8')
}

function cleanQuery(value: Record<string, string>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== ''))
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function rowId(row: ErrorLogRow) {
  return String(row.id ?? '')
}

function isRead(row: ErrorLogRow) {
  return Boolean(row.read_at)
}

function isSelected(row: ErrorLogRow) {
  return selectedIds.value.includes(rowId(row))
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
