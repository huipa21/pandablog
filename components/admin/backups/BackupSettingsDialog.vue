<template>
  <UModal :open="open" @update:open="$emit('update:open', $event)">
    <template #content>
      <div class="p-5">
        <h2 class="text-xl font-semibold text-[var(--pb-text)]">{{ t('admin.backups.settingsDialog.title') }}</h2>
        <p class="mt-1 text-sm text-[var(--pb-text-muted)]">{{ t('admin.backups.settingsDialog.description') }}</p>

        <div v-if="loading" class="mt-4 text-sm text-[var(--pb-text-muted)]">{{ t('admin.common.loading') }}</div>

        <template v-else>
          <!-- Retention -->
          <div class="mt-4">
            <label class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.backups.settingsDialog.maxBackups') }}</label>
            <UInput
              v-model.number="form.max_backups"
              type="number"
              :min="0"
              :max="1000"
              class="mt-1 w-32"
            />
            <p class="mt-1 text-xs text-[var(--pb-text-muted)]">{{ t('admin.backups.settingsDialog.maxBackupsHint') }}</p>
          </div>

          <!-- Validate before restore -->
          <div class="mt-4 flex items-start justify-between gap-3">
            <div>
              <span class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.backups.settingsDialog.validateBeforeRestore') }}</span>
              <span class="mt-0.5 block text-xs text-[var(--pb-text-muted)]">{{ t('admin.backups.settingsDialog.validateBeforeRestoreHint') }}</span>
            </div>
            <USwitch v-model="form.validate_before_restore" />
          </div>

          <!-- Auto safety snapshot -->
          <div class="mt-4 flex items-start justify-between gap-3">
            <div>
              <span class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.backups.settingsDialog.autoSafetySnapshot') }}</span>
              <span class="mt-0.5 block text-xs text-[var(--pb-text-muted)]">{{ t('admin.backups.settingsDialog.autoSafetySnapshotHint') }}</span>
            </div>
            <USwitch v-model="form.auto_safety_snapshot" />
          </div>

          <UAlert v-if="error" color="error" class="mt-4" :description="error" />
        </template>

        <div class="mt-5 flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="saving" @click="$emit('update:open', false)">
            {{ t('admin.common.cancel') }}
          </UButton>
          <UButton :loading="saving" :disabled="loading" @click="save">
            {{ saving ? t('admin.common.saving') : t('admin.common.save') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
interface BackupSettings {
  max_backups: number
  validate_before_restore: boolean
  auto_safety_snapshot: boolean
  default_excluded_tables: string[]
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { t } = useI18n()

const form = reactive<BackupSettings>({
  max_backups: 10,
  validate_before_restore: true,
  auto_safety_snapshot: true,
  default_excluded_tables: [],
})

const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open) void load()
  }
)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{ settings: BackupSettings }>('/api/admin/backups/settings')
    Object.assign(form, res.settings)
  } catch (err: any) {
    error.value = err?.data?.message ?? err?.message ?? 'Failed to load settings'
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  error.value = null
  try {
    await $fetch('/api/admin/backups/settings', {
      method: 'PUT',
      body: {
        max_backups: form.max_backups,
        validate_before_restore: form.validate_before_restore,
        auto_safety_snapshot: form.auto_safety_snapshot,
        default_excluded_tables: form.default_excluded_tables,
      },
    })
    emit('saved')
    emit('update:open', false)
  } catch (err: any) {
    error.value = err?.data?.message ?? err?.message ?? 'Failed to save settings'
  } finally {
    saving.value = false
  }
}
</script>
