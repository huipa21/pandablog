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

          <p class="mt-4 text-sm text-[var(--pb-text-muted)]">{{ t('admin.backups.settingsDialog.protections') }}</p>
          <UAlert v-if="!form.auto_safety_snapshot" color="warning" class="mt-4" :description="t('admin.backups.settingsDialog.safetyDisabled')" />
          <UButton v-if="!form.auto_safety_snapshot" class="mt-2" :disabled="saving" @click="enableSafety">{{ t('admin.backups.settingsDialog.enableSafety') }}</UButton>

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

async function enableSafety() {
  if (saving.value) return
  saving.value = true; error.value = null
  try {
    await $fetch('/api/admin/backups/settings', {method: 'PUT', body: {auto_safety_snapshot: true}})
    form.auto_safety_snapshot = true
  } catch (err: any) {error.value = err?.data?.message ?? t('admin.backups.settingsDialog.saveFailed')}
  finally {saving.value = false}
}

async function save() {
  if (saving.value) return
  saving.value = true
  error.value = null
  try {
    await $fetch('/api/admin/backups/settings', {
      method: 'PUT',
      body: {
        max_backups: form.max_backups,
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
