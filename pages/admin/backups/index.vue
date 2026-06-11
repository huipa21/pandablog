<template>
  <section class="grid gap-6 pb-24">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.backups.eyebrow') }}</p>
        <h1 class="mt-1 text-3xl font-semibold text-[var(--pb-text)]">{{ t('admin.backups.title') }}</h1>
        <p class="mt-2 text-sm text-[var(--pb-text-muted)]">{{ t('admin.backups.description') }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          icon="i-lucide-settings"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="settingsDialogOpen = true"
        >
          {{ t('admin.backups.settings') }}
        </UButton>
        <UButton
          icon="i-lucide-upload"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!!activeJob"
          @click="importDialogOpen = true"
        >
          {{ t('admin.backups.importBackup') }}
        </UButton>
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="!!activeJob"
          @click="openCreateDialog('incremental')"
        >
          {{ t('admin.backups.createIncremental') }}
        </UButton>
        <UButton
          icon="i-lucide-database"
          size="sm"
          :disabled="!!activeJob"
          @click="openCreateDialog('full')"
        >
          {{ t('admin.backups.createFull') }}
        </UButton>
      </div>
    </header>

    <UAlert v-if="loadError" color="error" icon="i-lucide-circle-alert" :title="t('admin.backups.loadFailed')" />

    <!-- Active job banner -->
    <div
      v-if="activeJob"
      class="flex flex-col gap-3 rounded-[var(--pb-radius-card-outer)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin shrink-0" />
        <span>
          {{ t('admin.backups.activeJobBanner', { kind: jobKindLabel(activeJob.kind), time: formatDateTime(activeJob.startedAt) }) }}
        </span>
      </div>
      <div v-if="activeJob.progress" class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-xs font-medium">
          <span>{{ progressPhaseLabel(activeJob.progress.phase) }}<template v-if="activeJob.progress.detail"> · {{ activeJob.progress.detail }}</template></span>
          <span class="tabular-nums">{{ activeJob.progress.percent }}%</span>
        </div>
        <UProgress :model-value="activeJob.progress.percent" :max="100" size="sm" color="warning" />
      </div>
    </div>

    <!-- No backups -->
    <div
      v-if="!pending && !snapshots.length"
      class="rounded-[var(--pb-radius-card-outer)] border border-dashed border-[var(--pb-divider-strong)] p-8 text-center text-sm text-[var(--pb-text-subtle)]"
    >
      {{ t('admin.backups.noBackups') }}
    </div>

    <!-- Skeleton loading (initial load only) -->
    <div v-if="pending && !snapshots.length" class="grid gap-3">
      <USkeleton v-for="i in 3" :key="i" class="h-28 rounded-[var(--pb-radius-card-outer)]" />
    </div>

    <!-- Snapshot list -->
    <div class="grid gap-3">
      <article
        v-for="snap in snapshots"
        :key="snap.id"
        class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="grid gap-1">
            <!-- Badges -->
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="rounded-full px-2 py-0.5 text-xs font-semibold"
                :class="typeBadgeClass(snap.type)"
              >
                {{ typeLabel(snap.type) }}
              </span>
              <span
                class="rounded-full px-2 py-0.5 text-xs font-semibold"
                :class="statusClass(snap.status)"
              >
                {{ statusLabel(snap.status) }}
              </span>
              <span class="font-mono text-xs text-[var(--pb-text-subtle)]">{{ snap.id }}</span>
            </div>
            <!-- Meta -->
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--pb-text-muted)]">
              <span>{{ formatDateTime(snap.created_at) }}</span>
              <span>{{ t('admin.backups.dbSize') }}: {{ formatBytes(snap.db_size_bytes) }}</span>
              <span>{{ t('admin.backups.mediaSize') }}: {{ formatBytes(snap.media_size_bytes) }}</span>
              <span>{{ t('admin.backups.fileCount', { count: snap.media_file_count }) }}</span>
              <span v-if="snap.parent">{{ t('admin.backups.parent') }}: <span class="font-mono">{{ snap.parent }}</span></span>
            </div>
            <p v-if="snap.note" class="text-xs text-[var(--pb-text-muted)]">{{ snap.note }}</p>
            <p v-if="snap.error" class="text-xs text-rose-600">{{ snap.error }}</p>
          </div>

          <!-- Actions -->
          <div v-if="snap.status === 'ready'" class="flex flex-wrap items-center gap-2">
            <!-- Download split button -->
            <UDropdownMenu
              :items="downloadItems(snap)"
              :content="{ align: 'end' }"
            >
              <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-download" trailing-icon="i-lucide-chevron-down">
                {{ t('admin.backups.download') }}
              </UButton>
            </UDropdownMenu>

            <UButton
              size="xs"
              color="warning"
              variant="soft"
              icon="i-lucide-rotate-ccw"
              :disabled="!!activeJob"
              @click="openRestoreDialog(snap.id)"
            >
              {{ t('admin.backups.restore') }}
            </UButton>
            <UButton
              size="xs"
              color="error"
              variant="soft"
              icon="i-lucide-trash-2"
              @click="openDeleteDialog(snap.id, snap.descendant_count ?? 0)"
            >
              {{ t('admin.backups.delete') }}
            </UButton>
          </div>

          <!-- Actions for failed backups: allow cleanup -->
          <div v-else-if="snap.status === 'failed'" class="flex flex-wrap items-center gap-2">
            <UButton
              size="xs"
              color="error"
              variant="soft"
              icon="i-lucide-trash-2"
              :disabled="!!activeJob"
              @click="openDeleteDialog(snap.id, snap.descendant_count ?? 0)"
            >
              {{ t('admin.backups.delete') }}
            </UButton>
          </div>
        </div>
      </article>
    </div>

    <!-- Dialogs -->
    <BackupCreateDialog
      :open="createDialogOpen"
      :snapshots="snapshots"
      @update:open="createDialogOpen = $event"
      @created="onCreated"
    />

    <BackupRestoreDialog
      :open="restoreDialogOpen"
      :snapshot-id="activeRestoreId"
      @update:open="restoreDialogOpen = $event"
      @restored="onRestored"
    />

    <BackupDeleteDialog
      :open="deleteDialogOpen"
      :snapshot-id="activeDeleteId"
      :descendant-count="activeDeleteDescendants"
      @update:open="deleteDialogOpen = $event"
      @deleted="onDeleted"
    />

    <BackupImportDialog
      :open="importDialogOpen"
      @update:open="importDialogOpen = $event"
      @imported="onImported"
    />

    <BackupSettingsDialog
      :open="settingsDialogOpen"
      @update:open="settingsDialogOpen = $event"
      @saved="onSettingsSaved"
    />
  </section>
</template>

<script setup lang="ts">
import type { BackupRecord } from '~/server/utils/backups/config'
import type { ActiveJob } from '~/server/utils/backups/jobMutex'
import BackupCreateDialog from '~/components/admin/backups/BackupCreateDialog.vue'
import BackupRestoreDialog from '~/components/admin/backups/BackupRestoreDialog.vue'
import BackupDeleteDialog from '~/components/admin/backups/BackupDeleteDialog.vue'
import BackupImportDialog from '~/components/admin/backups/BackupImportDialog.vue'
import BackupSettingsDialog from '~/components/admin/backups/BackupSettingsDialog.vue'

definePageMeta({ layout: 'admin' })

type ActiveJobStatus = ActiveJob

const { t } = useI18n()

// ---- Data fetching ----
const { data: snapshotsData, pending, error: loadError, refresh: refreshSnapshots } = await useAsyncData(
  'admin-backups-list',
  () => $fetch<Array<BackupRecord & { descendant_count: number }>>('/api/admin/backups')
)

const snapshots = computed(() => snapshotsData.value ?? [])

// ---- Status polling ----
const { data: statusData, refresh: refreshStatus } = await useAsyncData(
  'admin-backups-status',
  () => $fetch<{ activeJob: ActiveJobStatus | null }>('/api/admin/backups/status')
)

const activeJob = computed(() => statusData.value?.activeJob ?? null)

let pollTimer: ReturnType<typeof setInterval> | null = null

watch(activeJob, (job) => {
  if (job && !pollTimer) {
    pollTimer = setInterval(async () => {
      await refreshStatus()
      await refreshSnapshots()
      if (!activeJob.value) {
        clearInterval(pollTimer!)
        pollTimer = null
      }
    }, 1000)
  }
}, { immediate: true })

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

// ---- Dialog state ----
const createDialogOpen = ref(false)
const createInitialType = ref<'full' | 'incremental'>('full')
const restoreDialogOpen = ref(false)
const activeRestoreId = ref('')
const deleteDialogOpen = ref(false)
const activeDeleteId = ref('')
const activeDeleteDescendants = ref(0)
const importDialogOpen = ref(false)
const settingsDialogOpen = ref(false)

function openCreateDialog(type: 'full' | 'incremental') {
  createInitialType.value = type
  createDialogOpen.value = true
}

function openRestoreDialog(id: string) {
  activeRestoreId.value = id
  restoreDialogOpen.value = true
}

function openDeleteDialog(id: string, descendants: number) {
  activeDeleteId.value = id
  activeDeleteDescendants.value = descendants
  deleteDialogOpen.value = true
}

async function onCreated(_id: string) {
  await refreshSnapshots()
  await refreshStatus()
}

async function onRestored() {
  await refreshStatus()
  await refreshSnapshots()
}

async function onDeleted() {
  await refreshSnapshots()
}

async function onImported(_id: string) {
  await refreshSnapshots()
}

function onSettingsSaved() {
  settingsDialogOpen.value = false
}

// ---- Helpers ----
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function statusClass(status: string) {
  return {
    creating: 'bg-amber-100 text-amber-800',
    ready: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-rose-100 text-rose-800',
    restoring: 'bg-purple-100 text-purple-800',
  }[status] ?? 'bg-stone-100 text-stone-700'
}

function statusLabel(status: string): string {
  return {
    creating: t('admin.backups.statusCreating'),
    ready: t('admin.backups.statusReady'),
    failed: t('admin.backups.statusFailed'),
    restoring: t('admin.backups.statusRestoring'),
  }[status] ?? status
}

function jobKindLabel(kind: string): string {
  return {
    create: t('admin.backups.kindCreate'),
    restore: t('admin.backups.kindRestore'),
    import: t('admin.backups.kindImport'),
  }[kind] ?? kind
}

function progressPhaseLabel(phase: string): string {
  return {
    'preparing': t('admin.backups.progressPreparing'),
    'db-export': t('admin.backups.progressDbExport'),
    'media-collect': t('admin.backups.progressMediaCollect'),
    'media-pack': t('admin.backups.progressMediaPack'),
    'finalize': t('admin.backups.progressFinalize'),
    'db-wipe': t('admin.backups.progressDbWipe'),
    'db-restore': t('admin.backups.progressDbRestore'),
    'media-restore': t('admin.backups.progressMediaRestore'),
    'safety-snapshot': t('admin.backups.progressSafetySnapshot'),
    'db-validate': t('admin.backups.progressDbValidate'),
    'db-consolidate': t('admin.backups.progressDbConsolidate'),
    'db-verify': t('admin.backups.progressDbVerify'),
    'rollback': t('admin.backups.progressRollback'),
  }[phase] ?? phase
}

function typeLabel(type: string): string {
  return {
    full: t('admin.backups.typeFull'),
    incremental: t('admin.backups.typeIncremental'),
    partial: t('admin.backups.typePartial'),
  }[type] ?? type
}

function typeBadgeClass(type: string): string {
  return {
    full: 'bg-blue-100 text-blue-800',
    incremental: 'bg-teal-100 text-teal-800',
    partial: 'bg-violet-100 text-violet-800',
  }[type] ?? 'bg-stone-100 text-stone-700'
}

function downloadItems(snap: BackupRecord & { descendant_count?: number }) {
  const id = snap.id
  return [
    [
      {
        label: t('admin.backups.downloadDb'),
        icon: 'i-lucide-file-archive',
        onSelect() { window.open(`/api/admin/backups/${id}/download/db`, '_blank') },
      },
      {
        label: t('admin.backups.downloadMedia'),
        icon: 'i-lucide-image',
        onSelect() { window.open(`/api/admin/backups/${id}/download/media`, '_blank') },
      },
      ...(snap.type === 'incremental'
        ? [{
            label: t('admin.backups.downloadMediaConsolidated'),
            icon: 'i-lucide-layers',
            onSelect() { window.open(`/api/admin/backups/${id}/download/media?consolidate=1`, '_blank') },
          }]
        : []),
      ...(snap.type === 'partial'
        ? [{
            label: t('admin.backups.downloadDbConsolidated'),
            icon: 'i-lucide-layers',
            onSelect() { window.open(`/api/admin/backups/${id}/download/db?consolidated=1`, '_blank') },
          }]
        : []),
    ],
  ]
}
</script>
