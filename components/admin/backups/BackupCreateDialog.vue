<template>
  <UModal :open="open" @update:open="$emit('update:open', $event)">
    <template #content>
      <div class="p-5">
        <h2 class="text-xl font-semibold text-[var(--pb-text)]">{{ t('admin.backups.createDialog.title') }}</h2>

        <!-- Type selector -->
        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          <label
            class="flex cursor-pointer items-start gap-3 rounded-[var(--pb-radius-card-inner)] border p-3 transition"
            :class="form.type === 'full' ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)]' : 'border-[var(--pb-divider)]'"
          >
            <input v-model="form.type" type="radio" value="full" class="mt-0.5 accent-[var(--pb-link)]" />
            <span>
              <span class="block font-medium text-[var(--pb-text)]">{{ t('admin.backups.createDialog.typeFull') }}</span>
              <span class="mt-0.5 block text-xs text-[var(--pb-text-muted)]">{{ t('admin.backups.createDialog.typeFullDescription') }}</span>
            </span>
          </label>
          <label
            class="flex cursor-pointer items-start gap-3 rounded-[var(--pb-radius-card-inner)] border p-3 transition"
            :class="form.type === 'incremental' ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)]' : 'border-[var(--pb-divider)]'"
          >
            <input v-model="form.type" type="radio" value="incremental" class="mt-0.5 accent-[var(--pb-link)]" />
            <span>
              <span class="block font-medium text-[var(--pb-text)]">{{ t('admin.backups.createDialog.typeIncremental') }}</span>
              <span class="mt-0.5 block text-xs text-[var(--pb-text-muted)]">{{ t('admin.backups.createDialog.typeIncrementalDescription') }}</span>
            </span>
          </label>
          <label
            class="flex cursor-pointer items-start gap-3 rounded-[var(--pb-radius-card-inner)] border p-3 transition"
            :class="form.type === 'partial' ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)]' : 'border-[var(--pb-divider)]'"
          >
            <input v-model="form.type" type="radio" value="partial" class="mt-0.5 accent-[var(--pb-link)]" />
            <span>
              <span class="block font-medium text-[var(--pb-text)]">{{ t('admin.backups.createDialog.typePartial') }}</span>
              <span class="mt-0.5 block text-xs text-[var(--pb-text-muted)]">{{ t('admin.backups.createDialog.typePartialDescription') }}</span>
            </span>
          </label>
        </div>

        <!-- Parent selector (incremental only) -->
        <div v-if="form.type === 'incremental'" class="mt-4">
          <label class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.backups.createDialog.selectParent') }}</label>
          <USelect
            v-model="form.parent"
            :items="parentOptions"
            :placeholder="t('admin.backups.createDialog.selectParentPlaceholder')"
            class="mt-1"
          />
        </div>

        <!-- Base full backup selector (partial only) -->
        <div v-if="form.type === 'partial'" class="mt-4">
          <label class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.backups.createDialog.selectBaseFull') }}</label>
          <USelect
            v-model="form.parent"
            :items="fullParentOptions"
            :placeholder="t('admin.backups.createDialog.selectBaseFullPlaceholder')"
            class="mt-1"
          />
          <p class="mt-1 text-xs text-[var(--pb-text-muted)]">{{ t('admin.backups.createDialog.partialBaseHint') }}</p>
        </div>

        <!-- Table multiselect (partial only) -->
        <div v-if="form.type === 'partial'" class="mt-4">
          <label class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.backups.createDialog.selectTables') }}</label>
          <div v-if="tablesLoading" class="mt-1 text-xs text-[var(--pb-text-muted)]">{{ t('admin.common.loading') }}</div>
          <USelectMenu
            v-else
            v-model="form.tables"
            :items="tableOptions"
            multiple
            :placeholder="t('admin.backups.createDialog.selectTablesPlaceholder')"
            class="mt-1 w-full"
          />
          <p class="mt-1 text-xs text-[var(--pb-text-muted)]">{{ t('admin.backups.createDialog.partialTablesHint') }}</p>
        </div>

        <!-- Note -->
        <div class="mt-4">
          <label class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.backups.createDialog.note') }}</label>
          <UInput
            v-model="form.note"
            :placeholder="t('admin.backups.createDialog.notePlaceholder')"
            class="mt-1"
          />
        </div>

        <UAlert v-if="error" color="error" class="mt-4" :description="error" />

        <div class="mt-5 flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="submitting" @click="$emit('update:open', false)">
            {{ t('admin.common.cancel') }}
          </UButton>
          <UButton :loading="submitting" @click="submit">
            {{ submitting ? t('admin.backups.createDialog.creating') : t('admin.backups.createDialog.create') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { BackupRecord } from '~/server/utils/backups/config'

const props = defineProps<{
  open: boolean
  snapshots: BackupRecord[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': [id: string]
}>()

const { t } = useI18n()

const form = reactive({
  type: 'full' as 'full' | 'incremental' | 'partial',
  parent: undefined as string | undefined,
  note: '',
  tables: [] as string[],
})

const submitting = ref(false)
const error = ref<string | null>(null)

const tableOptions = ref<string[]>([])
const tablesLoading = ref(false)
let tablesLoaded = false

const parentOptions = computed(() =>
  props.snapshots
    .filter((s) => s.status === 'ready')
    .map((s) => ({
      label: `${s.id} (${s.type}, ${formatDate(s.created_at)})`,
      value: s.id,
    }))
)

const fullParentOptions = computed(() =>
  props.snapshots
    .filter((s) => s.status === 'ready' && s.type === 'full')
    .map((s) => ({
      label: `${s.id} (${formatDate(s.created_at)})`,
      value: s.id,
    }))
)

async function loadTables() {
  if (tablesLoaded) return
  tablesLoading.value = true
  try {
    const res = await $fetch<{ tables: string[] }>('/api/admin/backups/tables')
    tableOptions.value = res.tables
    tablesLoaded = true
  } catch {
    tableOptions.value = []
  } finally {
    tablesLoading.value = false
  }
}

watch(() => form.type, (type) => {
  if (type === 'partial') {
    void loadTables()
  }
})

async function submit() {
  error.value = null
  if (form.type === 'incremental' && !form.parent) {
    error.value = 'Please select a parent snapshot for an incremental backup.'
    return
  }
  if (form.type === 'partial') {
    if (!form.parent) {
      error.value = t('admin.backups.createDialog.partialBaseRequired')
      return
    }
    if (!form.tables.length) {
      error.value = t('admin.backups.createDialog.partialTablesRequired')
      return
    }
  }
  submitting.value = true
  try {
    const result = await $fetch<{ ok: boolean, id: string }>('/api/admin/backups', {
      method: 'POST',
      body: {
        type: form.type,
        note: form.note || null,
        parent: form.type === 'incremental' || form.type === 'partial' ? (form.parent ?? null) : null,
        tables: form.type === 'partial' ? form.tables : null,
      },
    })
    emit('created', result.id)
    emit('update:open', false)
    form.type = 'full'
    form.parent = undefined
    form.note = ''
    form.tables = []
  } catch (err: any) {
    error.value = err?.data?.message ?? err?.message ?? t('admin.backups.createDialog.createFailed')
  } finally {
    submitting.value = false
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}
</script>
