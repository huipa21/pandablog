<template>
  <section class="grid gap-6 pb-24">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Tools</p>
      <h1 class="mt-1 text-3xl font-semibold text-[var(--pb-text)]">Logging settings</h1>
      <p class="mt-2 text-sm text-[var(--pb-text-muted)]">Runtime logging controls backed by app settings.</p>
      <p class="mt-1 text-xs text-[var(--pb-text-subtle)]">Last updated: {{ form.updated_at || 'unknown' }}</p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load logging settings" />

    <div class="grid gap-4">
      <section class="grid gap-4 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
        <div>
          <h2 class="text-xl font-semibold tracking-normal text-[var(--pb-text)]">Master controls</h2>
          <p class="mt-1 text-sm text-[var(--pb-text-muted)]">Enable or silence logging globally without changing individual categories.</p>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <label v-for="item in masterControls" :key="item.key" class="flex cursor-pointer items-start justify-between gap-4 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
            <span class="grid gap-1">
              <span class="font-medium text-[var(--pb-text)]">{{ item.label }}</span>
              <span class="text-sm text-[var(--pb-text-muted)]">{{ item.description }}</span>
            </span>
            <USwitch v-model="form[item.key]" :aria-label="item.label" />
          </label>
        </div>
      </section>

      <section class="grid gap-4 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
        <div>
          <h2 class="text-xl font-semibold tracking-normal text-[var(--pb-text)]">Log categories</h2>
          <p class="mt-1 text-sm text-[var(--pb-text-muted)]">Choose which operational events are recorded.</p>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <label v-for="item in categoryControls" :key="item.key" class="flex cursor-pointer items-start justify-between gap-4 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
            <span class="grid gap-1">
              <span class="font-medium text-[var(--pb-text)]">{{ item.label }}</span>
              <span class="text-sm text-[var(--pb-text-muted)]">{{ item.description }}</span>
            </span>
            <USwitch v-model="form[item.key]" :aria-label="item.label" />
          </label>
        </div>
        <UAlert color="warning" icon="i-lucide-triangle-alert" title="Debug is disabled in production unless override is enabled." />
      </section>

      <section class="grid gap-4 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
        <div>
          <h2 class="text-xl font-semibold tracking-normal text-[var(--pb-text)]">Levels and filtering</h2>
          <p class="mt-1 text-sm text-[var(--pb-text-muted)]">Reduce noisy events and redact sensitive metadata before it reaches storage.</p>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField label="Minimum level" name="log_level">
            <USelect v-model="form.log_level" :items="levelItems" icon="i-lucide-list-filter" class="w-full" />
            <template #hint>Only events at this level or higher are mirrored to console output.</template>
          </UFormField>

          <UFormField label="Sampling rate" name="sampling_rate">
            <UInput v-model.number="form.sampling_rate" type="number" min="0" max="1" step="0.01" icon="i-lucide-percent" placeholder="1" />
            <template #hint>Fraction of access log requests to record. Use 0.1 to capture 10% of traffic.</template>
          </UFormField>

          <UFormField label="Excluded paths" name="excluded_paths">
            <UTextarea v-model="excludedPathsText" :rows="4" placeholder="/_nuxt&#10;/favicon" />
            <template #hint>One path prefix per line. Matching requests are not written to access logs.</template>
          </UFormField>

          <UFormField label="Excluded status codes" name="excluded_status_codes">
            <UTextarea v-model="excludedStatusCodesText" :rows="4" placeholder="204, 304" />
            <template #hint>Comma or newline separated HTTP status codes to skip.</template>
          </UFormField>

          <UFormField label="Redacted fields" name="redact_fields" class="md:col-span-2">
            <UTextarea v-model="redactFieldsText" :rows="4" placeholder="password&#10;token&#10;authorization" />
            <template #hint>Field names removed from metadata before writing activity and error logs.</template>
          </UFormField>
        </div>
      </section>

      <section class="grid gap-4 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
        <div>
          <h2 class="text-xl font-semibold tracking-normal text-[var(--pb-text)]">Limits</h2>
          <p class="mt-1 text-sm text-[var(--pb-text-muted)]">Keep large metadata payloads from bloating log rows.</p>
        </div>
        <UFormField label="Max metadata size (KB)" name="max_metadata_size_kb" class="max-w-xl">
          <UInput v-model.number="form.max_metadata_size_kb" type="number" min="1" max="1024" icon="i-lucide-hard-drive" placeholder="50" />
          <template #hint>Maximum metadata stored per log entry. Larger payloads are truncated.</template>
        </UFormField>
      </section>

      <section class="grid gap-4 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
        <div>
          <h2 class="text-xl font-semibold tracking-normal text-[var(--pb-text)]">Retention defaults</h2>
          <p class="mt-1 text-sm text-[var(--pb-text-muted)]">Suggested age caps for manual cleanup. They are not enforced automatically.</p>
        </div>
        <div class="grid gap-4 md:grid-cols-3">
          <UFormField v-for="item in retentionControls" :key="item.key" :label="item.label" :name="item.key">
            <UInput v-model.number="form[item.key]" type="number" min="1" max="3650" icon="i-lucide-calendar-clock" />
            <template #hint>{{ item.description }}</template>
          </UFormField>
        </div>
      </section>

      <section class="grid gap-4 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
        <div>
          <h2 class="text-xl font-semibold tracking-normal text-[var(--pb-text)]">Manual cleanup</h2>
          <p class="mt-1 text-sm text-[var(--pb-text-muted)]">Run cleanup only when needed. Choose a log type, a rule, and confirm the deletion.</p>
        </div>

        <div class="grid gap-5">
          <div v-for="target in cleanupTargets" :key="target.type" class="grid gap-3 border-t border-[var(--pb-divider)] pt-5 first:border-t-0 first:pt-0">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 class="text-base font-semibold text-[var(--pb-text)]">{{ target.label }}</h3>
                <p class="mt-1 text-sm text-[var(--pb-text-muted)]">{{ target.description }}</p>
              </div>
              <UButton icon="i-lucide-trash-2" color="warning" variant="outline" :loading="cleanupLoadingType === target.type" @click="openCleanupDialog(target.type)">
                Run cleanup
              </UButton>
            </div>

            <fieldset class="grid gap-3 md:grid-cols-2">
              <label
                v-for="mode in cleanupModeOptions"
                :key="mode.value"
                class="flex cursor-pointer items-start gap-3 rounded-[var(--pb-radius-card-inner)] border p-3"
                :class="cleanupControls[target.type].mode === mode.value ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)]' : 'border-[var(--pb-divider)]'"
              >
                <input v-model="cleanupControls[target.type].mode" type="radio" :value="mode.value" class="mt-1">
                <span class="grid gap-1">
                  <span class="font-medium text-[var(--pb-text)]">{{ mode.label }}</span>
                  <span class="text-sm text-[var(--pb-text-muted)]">{{ mode.description }}</span>
                </span>
              </label>
            </fieldset>

            <UFormField :label="cleanupValueLabel(cleanupControls[target.type].mode)" :name="`${target.type}_cleanup_value`">
              <UInput
                v-model.number="cleanupControls[target.type].value"
                type="number"
                min="1"
                :max="cleanupControls[target.type].mode === 'older_than_days' ? 3650 : 1000000"
                :icon="cleanupControls[target.type].mode === 'older_than_days' ? 'i-lucide-calendar-clock' : 'i-lucide-list-ordered'"
              />
              <template #hint>{{ cleanupValueHint(target.type, cleanupControls[target.type].mode) }}</template>
            </UFormField>
          </div>
        </div>
      </section>

      <section class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
        <UButton color="error" variant="outline" icon="i-lucide-rotate-ccw" :loading="resetting" @click="resetDefaults">Reset to defaults</UButton>
      </section>
    </div>

    <footer v-if="isDirty" class="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--pb-divider)] bg-[color-mix(in_srgb,var(--pb-card-bg)_95%,transparent)] px-4 py-3 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="discard">Discard</UButton>
        <UButton icon="i-lucide-save" :loading="saving" @click="save">Save changes</UButton>
      </div>
    </footer>

    <AdminConfirmActionDialog
      :open="cleanupDialogOpen"
      :title="cleanupDialogTitle"
      :description="cleanupDialogDescription"
      confirm-label="Run cleanup"
      confirm-color="warning"
      :loading="cleaning"
      @update:open="(value) => { if (!value) closeCleanupDialog() }"
      @cancel="closeCleanupDialog"
      @confirm="runCleanup"
    />
  </section>
</template>

<script setup lang="ts">
import type { LogCleanupMode, LogCleanupType, LoggingSettings } from '~/types/logging'

definePageMeta({ layout: 'admin' })

type LoggingSettingsPayload = Omit<LoggingSettings, 'updated_at'>
type ToggleKey = 'enabled' | 'console_output' | 'access_log_enabled' | 'activity_log_enabled' | 'error_log_enabled' | 'debug_enabled' | 'debug_override_prod'
type RetentionKey = 'retention_access_days' | 'retention_activity_days' | 'retention_error_days'

const { data, error } = await useAsyncData('admin-logging-settings', () => $fetch('/api/admin/settings/logging'))

const form = reactive<LoggingSettings>(blankForm())
const excludedPathsText = ref('')
const excludedStatusCodesText = ref('')
const redactFieldsText = ref('')
const adminToast = useAdminToast()
const originalSettings = ref<LoggingSettings>(blankForm())
const originalPayload = ref<LoggingSettingsPayload>(toPayload())
const saving = ref(false)
const resetting = ref(false)
const cleanupLoadingType = ref<LogCleanupType | null>(null)
const activeCleanup = ref<{ type: LogCleanupType, mode: LogCleanupMode, value: number } | null>(null)

const levelItems = [
  { label: 'Debug', value: 'debug' },
  { label: 'Info', value: 'info' },
  { label: 'Warn', value: 'warn' },
  { label: 'Error', value: 'error' }
]

const masterControls: Array<{ key: ToggleKey, label: string, description: string }> = [
  { key: 'enabled', label: 'Enable logging', description: 'Controls whether access, activity, and error rows are written.' },
  { key: 'console_output', label: 'Console output', description: 'Mirror log events to the server console for local debugging.' }
]

const categoryControls: Array<{ key: ToggleKey, label: string, description: string }> = [
  { key: 'access_log_enabled', label: 'Access logs', description: 'Record request method, path, status, duration, and client details.' },
  { key: 'activity_log_enabled', label: 'Activity logs', description: 'Record admin actions such as edits, sign-ins, and cleanup runs.' },
  { key: 'error_log_enabled', label: 'Error logs', description: 'Record handled server errors and exception context.' },
  { key: 'debug_enabled', label: 'Debug logs', description: 'Allow debug-level events when the runtime also permits them.' },
  { key: 'debug_override_prod', label: 'Override debug protection', description: 'Permit debug logging in production when debug logging is enabled.' }
]

const retentionControls: Array<{ key: RetentionKey, label: string, description: string }> = [
  { key: 'retention_access_days', label: 'Access logs', description: 'Default days for request logs.' },
  { key: 'retention_activity_days', label: 'Activity logs', description: 'Default days for admin actions.' },
  { key: 'retention_error_days', label: 'Error logs', description: 'Default days for exceptions.' }
]

const cleanupModeOptions: Array<{ value: LogCleanupMode, label: string, description: string }> = [
  { value: 'older_than_days', label: 'Delete logs older than', description: 'Remove rows whose timestamp is older than the day count.' },
  { value: 'keep_latest', label: 'Keep latest logs', description: 'Keep the newest N rows and remove older entries.' }
]

const cleanupTargets: Array<{ type: LogCleanupType, label: string, description: string, retentionKey: RetentionKey }> = [
  { type: 'access', label: 'Access logs', description: 'HTTP request history and response metadata.', retentionKey: 'retention_access_days' },
  { type: 'activity', label: 'Activity logs', description: 'Admin actions and system audit records.', retentionKey: 'retention_activity_days' },
  { type: 'errors', label: 'Error logs', description: 'Server errors, stack traces, and request context.', retentionKey: 'retention_error_days' }
]

const cleanupControls = reactive<Record<LogCleanupType, { mode: LogCleanupMode, value: number }>>({
  access: { mode: 'older_than_days', value: 30 },
  activity: { mode: 'older_than_days', value: 365 },
  errors: { mode: 'older_than_days', value: 90 }
})

watch(data, (value) => {
  const settings = (value as any)?.settings
  if (settings) {
    applySettings(settings)
  }
}, { immediate: true })

const cleaning = computed(() => cleanupLoadingType.value !== null)
const cleanupDialogOpen = computed(() => activeCleanup.value !== null)
const cleanupDialogTitle = computed(() => {
  const cleanup = activeCleanup.value
  if (!cleanup) {
    return 'Run cleanup?'
  }

  return cleanup.mode === 'older_than_days'
    ? `Delete old ${cleanupTargetLabel(cleanup.type)}?`
    : `Keep latest ${cleanupTargetLabel(cleanup.type)}?`
})
const cleanupDialogDescription = computed(() => {
  const cleanup = activeCleanup.value
  if (!cleanup) {
    return ''
  }

  return cleanup.mode === 'older_than_days'
    ? `Delete ${cleanupTargetLabel(cleanup.type)} older than ${cleanup.value} days.`
    : `Keep the latest ${cleanup.value} ${cleanupTargetLabel(cleanup.type)} and delete older rows.`
})
const isDirty = computed(() => JSON.stringify(toPayload()) !== JSON.stringify(originalPayload.value))

async function save() {
  saving.value = true

  try {
    const response = await $fetch('/api/admin/settings/logging', {
      method: 'PUT',
      body: toPayload()
    })

    applySettings((response as any).settings)
    adminToast.success('Logging settings saved')
  } catch (err: any) {
    adminToast.error(err, 'Save failed')
  } finally {
    saving.value = false
  }
}

async function resetDefaults() {
  resetting.value = true

  try {
    const response = await $fetch('/api/admin/settings/logging/reset', { method: 'POST' })
    applySettings((response as any).settings)
    adminToast.success('Defaults restored')
  } catch (err: any) {
    adminToast.error(err, 'Reset failed')
  } finally {
    resetting.value = false
  }
}

function openCleanupDialog(type: LogCleanupType) {
  const control = cleanupControls[type]
  const value = Number(control.value)
  if (!Number.isInteger(value) || value < 1) {
    adminToast.error(new Error('Cleanup value must be a positive whole number'), 'Cleanup value must be a positive whole number')
    return
  }

  activeCleanup.value = { type, mode: control.mode, value }
}

function closeCleanupDialog() {
  if (!cleaning.value) {
    activeCleanup.value = null
  }
}

async function runCleanup() {
  const cleanup = activeCleanup.value
  if (!cleanup) {
    return
  }

  cleanupLoadingType.value = cleanup.type

  try {
    const response = await $fetch('/api/admin/logs/cleanup', {
      method: 'POST',
      body: cleanup
    }) as any
    showCleanupResult(cleanup, Number(response?.result?.deleted ?? 0))
  } catch (err: any) {
    adminToast.error(err, 'Cleanup failed')
  } finally {
    cleanupLoadingType.value = null
    activeCleanup.value = null
  }
}

function discard() {
  Object.assign(form, JSON.parse(JSON.stringify(originalSettings.value)))
  syncTextFields(form)
  syncCleanupDefaults(form)
}

function applySettings(settings: Partial<LoggingSettings>) {
  Object.assign(form, blankForm(), settings)
  syncTextFields(form)
  syncCleanupDefaults(form)
  originalSettings.value = JSON.parse(JSON.stringify(form))
  originalPayload.value = JSON.parse(JSON.stringify(toPayload()))
}

function syncTextFields(settings: Partial<LoggingSettings>) {
  excludedPathsText.value = (settings.excluded_paths ?? []).join('\n')
  excludedStatusCodesText.value = (settings.excluded_status_codes ?? []).join(', ')
  redactFieldsText.value = (settings.redact_fields ?? []).join('\n')
}

function syncCleanupDefaults(settings: Partial<LoggingSettings>) {
  for (const target of cleanupTargets) {
    if (cleanupControls[target.type].mode === 'older_than_days') {
      cleanupControls[target.type].value = Number(settings[target.retentionKey] ?? blankForm()[target.retentionKey])
    }
  }
}

function toPayload(): LoggingSettingsPayload {
  return {
    enabled: form.enabled,
    debug_enabled: form.debug_enabled,
    debug_override_prod: form.debug_override_prod,
    access_log_enabled: form.access_log_enabled,
    activity_log_enabled: form.activity_log_enabled,
    error_log_enabled: form.error_log_enabled,
    log_level: form.log_level,
    excluded_paths: excludedPathsText.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean),
    excluded_status_codes: excludedStatusCodesText.value.split(/[\s,]+/).map(item => Number(item)).filter(item => Number.isInteger(item)),
    redact_fields: redactFieldsText.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean),
    retention_access_days: Number(form.retention_access_days),
    retention_activity_days: Number(form.retention_activity_days),
    retention_error_days: Number(form.retention_error_days),
    max_metadata_size_kb: Number(form.max_metadata_size_kb),
    sampling_rate: Number(form.sampling_rate),
    console_output: form.console_output
  }
}

function cleanupValueLabel(mode: LogCleanupMode) {
  return mode === 'older_than_days' ? 'Days' : 'Logs to keep'
}

function cleanupValueHint(type: LogCleanupType, mode: LogCleanupMode) {
  if (mode === 'keep_latest') {
    return 'Newest rows are preserved; older rows are deleted.'
  }

  return `Uses ${retentionDefault(type)} days from the saved retention default unless you enter another value.`
}

function retentionDefault(type: LogCleanupType) {
  const target = cleanupTargets.find(item => item.type === type)
  return target ? Number(form[target.retentionKey]) : 1
}

function cleanupTargetLabel(type: LogCleanupType) {
  return cleanupTargets.find(item => item.type === type)?.label.toLowerCase() ?? 'logs'
}

function showCleanupResult(cleanup: { type: LogCleanupType, mode: LogCleanupMode, value: number }, deleted: number) {
  const label = cleanupTargetLabel(cleanup.type)
  if (deleted === 0) {
    adminToast.info('Cleanup complete', `No matching ${label} to delete.`)
    return
  }

  if (cleanup.mode === 'older_than_days') {
    adminToast.success('Cleanup complete', `Deleted ${deleted} ${label} older than ${cleanupCutoffDate(cleanup.value)} (${cleanup.value} days).`)
    return
  }

  adminToast.success('Cleanup complete', `Deleted ${deleted} ${label}; kept newest ${cleanup.value}.`)
}

function cleanupCutoffDate(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

function blankForm(): LoggingSettings {
  return {
    enabled: true,
    debug_enabled: false,
    debug_override_prod: false,
    access_log_enabled: true,
    activity_log_enabled: true,
    error_log_enabled: true,
    log_level: 'info',
    excluded_paths: [],
    excluded_status_codes: [],
    redact_fields: [],
    retention_access_days: 30,
    retention_activity_days: 365,
    retention_error_days: 90,
    max_metadata_size_kb: 50,
    sampling_rate: 1,
    console_output: false,
    updated_at: ''
  }
}
</script>