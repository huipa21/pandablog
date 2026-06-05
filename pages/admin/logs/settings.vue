<template>
  <section class="grid gap-6 pb-24">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Logs</p>
      <h1 class="mt-1 text-3xl font-semibold text-[var(--pb-text)]">Logging settings</h1>
      <p class="mt-2 text-sm text-[var(--pb-text-muted)]">Runtime logging controls backed by SurrealDB.</p>
      <p class="mt-1 text-xs text-[var(--pb-text-subtle)]">Last updated: {{ form.updated_at || 'unknown' }}</p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load logging settings" />
    <UAlert v-if="saveError" color="error" icon="i-lucide-circle-alert" :title="saveError" />
    <UAlert v-if="notice" color="success" icon="i-lucide-check" :title="notice" />

    <div class="grid gap-4">
      <section class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
        <h2 class="text-sm font-semibold text-[var(--pb-text)]">Master controls</h2>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <UToggle v-model="form.enabled" label="Enable logging" />
          <UToggle v-model="form.console_output" label="Console output" />
        </div>
      </section>

      <section class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
        <h2 class="text-sm font-semibold text-[var(--pb-text)]">Log categories</h2>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <UToggle v-model="form.access_log_enabled" label="Access logs" />
          <UToggle v-model="form.activity_log_enabled" label="Activity logs" />
          <UToggle v-model="form.error_log_enabled" label="Error logs" />
          <UToggle v-model="form.debug_enabled" label="Debug logs" />
          <UToggle v-model="form.debug_override_prod" label="Override debug protection" />
        </div>
        <UAlert class="mt-3" color="warning" icon="i-lucide-triangle-alert" title="Debug is disabled in production unless override is enabled." />
      </section>

      <section class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
        <h2 class="text-sm font-semibold text-[var(--pb-text)]">Levels and filtering</h2>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <USelect v-model="form.log_level" :items="levelItems" />
          <UInput v-model.number="form.sampling_rate" type="number" min="0" max="1" step="0.01" placeholder="Sampling rate" />
          <UTextarea v-model="excludedPathsText" :rows="3" placeholder="Excluded paths (one per line)" />
          <UTextarea v-model="excludedStatusCodesText" :rows="3" placeholder="Excluded status codes (comma or newline)" />
          <UTextarea v-model="redactFieldsText" :rows="3" placeholder="Redacted fields (one per line)" />
        </div>
      </section>

      <section class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
        <h2 class="text-sm font-semibold text-[var(--pb-text)]">Limits</h2>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <UInput v-model.number="form.max_metadata_size_kb" type="number" min="1" max="1024" placeholder="Max metadata size (KB)" />
        </div>
      </section>

      <section class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
        <h2 class="text-sm font-semibold text-[var(--pb-text)]">Retention and cleanup</h2>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <UInput v-model.number="form.retention_access_days" type="number" min="1" placeholder="Access retention days" />
          <UInput v-model.number="form.retention_activity_days" type="number" min="1" placeholder="Activity retention days" />
          <UInput v-model.number="form.retention_error_days" type="number" min="1" placeholder="Error retention days" />
          <UToggle v-model="form.cleanup_enabled" label="Enable scheduled cleanup" />
          <UInput v-model="form.cleanup_cron" placeholder="Cleanup cron" />
        </div>
        <p class="mt-2 text-xs" :class="cronValid ? 'text-emerald-700' : 'text-rose-700'">{{ cronHint }}</p>
        <div class="mt-3">
          <UButton icon="i-lucide-trash-2" color="warning" variant="outline" :loading="cleaning" @click="openCleanupDialog">Run cleanup now</UButton>
        </div>
      </section>

      <section class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
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
      title="Run retention cleanup now?"
      description="This will delete logs that exceed your configured retention windows."
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
definePageMeta({ layout: 'admin' })

const { data, error, refresh } = await useAsyncData('admin-logging-settings', () => $fetch('/api/admin/settings/logging'))

const form = reactive<any>(blankForm())
const original = ref<any>(blankForm())
const saving = ref(false)
const resetting = ref(false)
const cleaning = ref(false)
const notice = ref('')
const saveError = ref('')
const cleanupDialogOpen = ref(false)

const levelItems = [
  { label: 'Debug', value: 'debug' },
  { label: 'Info', value: 'info' },
  { label: 'Warn', value: 'warn' },
  { label: 'Error', value: 'error' }
]

const excludedPathsText = ref('')
const excludedStatusCodesText = ref('')
const redactFieldsText = ref('')

watch(data, (value) => {
  const settings = (value as any)?.settings
  if (!settings) {
    return
  }

  Object.assign(form, settings)
  original.value = JSON.parse(JSON.stringify(settings))
  excludedPathsText.value = (settings.excluded_paths ?? []).join('\n')
  excludedStatusCodesText.value = (settings.excluded_status_codes ?? []).join(', ')
  redactFieldsText.value = (settings.redact_fields ?? []).join('\n')
}, { immediate: true })

const cronValid = computed(() => isCronExpressionLikelyValid(form.cleanup_cron || ''))
const cronHint = computed(() => cronValid.value ? `Cron is valid: ${form.cleanup_cron}` : 'Invalid cron expression')
const isDirty = computed(() => JSON.stringify(toPayload()) !== JSON.stringify(original.value))

async function save() {
  saving.value = true
  notice.value = ''
  saveError.value = ''

  try {
    const response = await $fetch('/api/admin/settings/logging', {
      method: 'PUT',
      body: toPayload()
    })

    Object.assign(form, (response as any).settings)
    original.value = JSON.parse(JSON.stringify((response as any).settings))
    notice.value = 'Logging settings saved'
  } catch (err: any) {
    saveError.value = err?.statusMessage ?? err?.message ?? 'Save failed'
  } finally {
    saving.value = false
  }
}

async function resetDefaults() {
  resetting.value = true
  notice.value = ''
  saveError.value = ''

  try {
    const response = await $fetch('/api/admin/settings/logging/reset', { method: 'POST' })
    Object.assign(form, (response as any).settings)
    original.value = JSON.parse(JSON.stringify((response as any).settings))
    excludedPathsText.value = ((response as any).settings.excluded_paths ?? []).join('\n')
    excludedStatusCodesText.value = ((response as any).settings.excluded_status_codes ?? []).join(', ')
    redactFieldsText.value = ((response as any).settings.redact_fields ?? []).join('\n')
    notice.value = 'Defaults restored'
  } catch (err: any) {
    saveError.value = err?.statusMessage ?? err?.message ?? 'Reset failed'
  } finally {
    resetting.value = false
  }
}

function openCleanupDialog() {
  cleanupDialogOpen.value = true
}

function closeCleanupDialog() {
  if (cleaning.value) {
    return
  }

  cleanupDialogOpen.value = false
}

async function runCleanup() {

  cleaning.value = true
  notice.value = ''
  saveError.value = ''

  try {
    const response = await $fetch('/api/admin/logs/cleanup', { method: 'POST' }) as any
    notice.value = `Cleanup complete. Deleted ${response?.result?.total_deleted ?? 0} rows.`
  } catch (err: any) {
    saveError.value = err?.statusMessage ?? err?.message ?? 'Cleanup failed'
  } finally {
    cleaning.value = false
    closeCleanupDialog()
  }
}

function discard() {
  Object.assign(form, JSON.parse(JSON.stringify(original.value)))
  excludedPathsText.value = (form.excluded_paths ?? []).join('\n')
  excludedStatusCodesText.value = (form.excluded_status_codes ?? []).join(', ')
  redactFieldsText.value = (form.redact_fields ?? []).join('\n')
}

function toPayload() {
  const payload = {
    ...form,
    excluded_paths: excludedPathsText.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean),
    excluded_status_codes: excludedStatusCodesText.value.split(/[\s,]+/).map(item => Number(item)).filter(item => Number.isInteger(item)),
    redact_fields: redactFieldsText.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
  }

  return payload
}

function blankForm() {
  return {
    enabled: true,
    debug_enabled: true,
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
    console_output: true,
    cleanup_enabled: true,
    cleanup_cron: '0 3 * * *',
    updated_at: ''
  }
}

function isCronExpressionLikelyValid(expression: string) {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) {
    return false
  }

  return parts.every((field) => {
    if (!field) {
      return false
    }

    return field.split(',').every((segment) => {
      if (segment === '*') {
        return true
      }

      if (/^\*\/\d+$/.test(segment)) {
        return Number(segment.slice(2)) > 0
      }

      if (/^\d+$/.test(segment)) {
        return true
      }

      if (/^\d+-\d+$/.test(segment)) {
        const [start, end] = segment.split('-').map(Number)
          return (start ?? 0) <= (end ?? 0)
      }

      return false
    })
  })
}
</script>
