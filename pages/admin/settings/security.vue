<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.settings.security.eyebrow') }}</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('admin.settings.security.title') }}</h1>
      <p class="mt-2 max-w-2xl text-sm text-[var(--pb-text-muted)]">{{ t('admin.settings.security.description') }}</p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :title="t('admin.settings.security.saveFailed')" />

    <form class="grid gap-5 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]" @submit.prevent="save">
      <div v-if="pending" class="grid gap-4">
        <USkeleton class="h-10" />
        <USkeleton class="h-10" />
        <USkeleton class="h-10" />
      </div>

      <template v-else>
        <fieldset v-if="securityAlertsModuleEnabled" class="space-y-3 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
          <legend class="text-sm font-medium text-[var(--pb-text-muted)]">{{ t('admin.settings.security.alertsTitle') }}</legend>
          <label class="flex items-start gap-3">
            <input v-model="form.security_alerts_enabled" type="checkbox" class="mt-1 rounded border-[var(--pb-border-strong)]">
            <span>
              <span class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.settings.security.enableAlerts') }}</span>
              <span class="block text-xs text-[var(--pb-text-muted)]">{{ t('admin.settings.security.enableAlertsHelp') }}</span>
            </span>
          </label>

          <UFormField :label="t('admin.settings.security.webhookUrl')" :description="t('admin.settings.security.webhookUrlHelp')" name="security_alert_webhook_url">
            <div class="flex gap-2">
              <UInput
                v-model="form.security_alert_webhook_url"
                type="url"
                inputmode="url"
                icon="i-lucide-webhook"
                :placeholder="t('admin.settings.security.webhookPlaceholder')"
                class="w-full"
              />
              <UButton
                type="button"
                color="neutral"
                variant="subtle"
                icon="i-lucide-send"
                :loading="testing"
                :disabled="!form.security_alert_webhook_url.trim()"
                @click="sendTest"
              >
                {{ t('admin.settings.security.test') }}
              </UButton>
            </div>
          </UFormField>
        </fieldset>

        <fieldset v-if="securityAlertsModuleEnabled" class="space-y-3 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
          <legend class="text-sm font-medium text-[var(--pb-text-muted)]">{{ t('admin.settings.security.triggersTitle') }}</legend>

          <label class="flex items-start gap-3">
            <input v-model="form.security_alert_on_failed_login" type="checkbox" class="mt-1 rounded border-[var(--pb-border-strong)]">
            <span>
              <span class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.settings.security.onFailedLogin') }}</span>
              <span class="block text-xs text-[var(--pb-text-muted)]">{{ t('admin.settings.security.onFailedLoginHelp') }}</span>
            </span>
          </label>

          <label class="flex items-start gap-3">
            <input v-model="form.security_alert_on_lockout" type="checkbox" class="mt-1 rounded border-[var(--pb-border-strong)]">
            <span>
              <span class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.settings.security.onLockout') }}</span>
              <span class="block text-xs text-[var(--pb-text-muted)]">{{ t('admin.settings.security.onLockoutHelp') }}</span>
            </span>
          </label>

          <label class="flex items-start gap-3">
            <input v-model="form.security_alert_on_new_login" type="checkbox" class="mt-1 rounded border-[var(--pb-border-strong)]">
            <span>
              <span class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.settings.security.onNewLogin') }}</span>
              <span class="block text-xs text-[var(--pb-text-muted)]">{{ t('admin.settings.security.onNewLoginHelp') }}</span>
            </span>
          </label>
        </fieldset>

        <fieldset v-if="mfaModuleEnabled" class="space-y-3 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
          <legend class="text-sm font-medium text-[var(--pb-text-muted)]">{{ t('admin.settings.security.mfaTitle') }}</legend>
          <label class="flex items-start gap-3">
            <input v-model="form.security_mfa_required_for_admins" type="checkbox" class="mt-1 rounded border-[var(--pb-border-strong)]">
            <span>
              <span class="block text-sm font-medium text-[var(--pb-text)]">{{ t('admin.settings.security.requireMfa') }}</span>
              <span class="block text-xs text-[var(--pb-text-muted)]">{{ t('admin.settings.security.requireMfaHelp') }}</span>
            </span>
          </label>
        </fieldset>

        <div class="flex justify-end">
          <UButton v-if="securityAlertsModuleEnabled || mfaModuleEnabled" type="submit" icon="i-lucide-save" :loading="saving">{{ t('common.save') }}</UButton>
        </div>
      </template>
    </form>

    <!-- Personal multi-factor authentication -->
    <section v-if="mfaModuleEnabled" class="grid gap-4 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
      <header class="grid gap-1">
        <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.settings.security.personalMfaTitle') }}</h2>
        <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.settings.security.personalMfaHelp') }}</p>
      </header>

      <div v-if="mfaPending" class="grid gap-3">
        <USkeleton class="h-10" />
      </div>

      <template v-else>
        <!-- Status: enabled -->
        <div v-if="mfaStatus?.enabled && mfaMode === 'idle'" class="grid gap-3">
          <UAlert
            color="success"
            variant="subtle"
            icon="i-lucide-shield-check"
            :title="t('admin.settings.security.mfaOnTitle')"
            :description="t('admin.settings.security.mfaOnDesc', { count: mfaStatus.backup_codes_remaining })"
          />
          <div class="flex justify-end">
            <UButton color="error" variant="subtle" icon="i-lucide-shield-off" @click="mfaMode = 'disable'">
              {{ t('admin.settings.security.mfaDisable') }}
            </UButton>
          </div>
        </div>

        <!-- Status: disabled -->
        <div v-else-if="!mfaStatus?.enabled && mfaMode === 'idle'" class="grid gap-3">
          <UAlert
            color="warning"
            variant="subtle"
            icon="i-lucide-shield-alert"
            :title="t('admin.settings.security.mfaOffTitle')"
            :description="t('admin.settings.security.mfaOffDesc')"
          />
          <div class="flex justify-end">
            <UButton color="primary" icon="i-lucide-shield-plus" :loading="mfaBusy" @click="beginEnroll">
              {{ t('admin.settings.security.mfaEnable') }}
            </UButton>
          </div>
        </div>

        <!-- Enrolling -->
        <form v-else-if="mfaMode === 'enroll'" class="grid gap-4" @submit.prevent="confirmEnroll">
          <p class="text-sm text-[var(--pb-text-muted)]">{{ t('public.login.mfa.enrollPrompt') }}</p>
          <img v-if="enrollQr" :src="enrollQr" :alt="t('public.login.mfa.qrAlt')" class="w-44 justify-self-center rounded-[var(--pb-radius-card-inner)] bg-white p-2">
          <p v-if="enrollSecret" class="text-center text-xs">
            <span class="text-[var(--pb-text-muted)]">{{ t('public.login.mfa.secret') }}</span>
            <code class="ml-2 break-all tracking-widest">{{ enrollSecret }}</code>
          </p>
          <UFormField :label="t('public.login.mfa.code')" name="mfa_code">
            <UInput v-model="mfaCode" autocomplete="one-time-code" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton type="button" color="neutral" variant="ghost" @click="cancelMfaFlow">{{ t('common.cancel') }}</UButton>
            <UButton type="submit" icon="i-lucide-check" :loading="mfaBusy" :disabled="!enrollSecret">{{ t('admin.settings.security.mfaEnable') }}</UButton>
          </div>
        </form>

        <!-- Backup codes shown once -->
        <div v-else-if="mfaMode === 'codes'" class="grid gap-3">
          <UAlert color="warning" variant="subtle" icon="i-lucide-key-round" :title="t('public.login.mfa.codesPrompt')" />
          <ul class="grid grid-cols-2 gap-2 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4 text-center">
            <li v-for="code in backupCodes" :key="code"><code class="tracking-widest">{{ code }}</code></li>
          </ul>
          <div class="flex justify-end">
            <UButton icon="i-lucide-check" @click="finishMfaFlow">{{ t('public.login.mfa.codesContinue') }}</UButton>
          </div>
        </div>

        <!-- Disabling -->
        <form v-else-if="mfaMode === 'disable'" class="grid gap-4" @submit.prevent="confirmDisable">
          <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.settings.security.mfaDisableHelp') }}</p>
          <UFormField :label="t('public.login.password')" name="mfa_password">
            <UInput v-model="disablePassword" type="password" autocomplete="current-password" class="w-full" />
          </UFormField>
          <UFormField :label="t('public.login.mfa.code')" name="mfa_disable_code">
            <UInput v-model="mfaCode" autocomplete="one-time-code" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton type="button" color="neutral" variant="ghost" @click="cancelMfaFlow">{{ t('common.cancel') }}</UButton>
            <UButton type="submit" color="error" icon="i-lucide-shield-off" :loading="mfaBusy">{{ t('admin.settings.security.mfaDisable') }}</UButton>
          </div>
        </form>
      </template>
    </section>
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const { data, pending, error } = await useAsyncData('admin-settings-security', () => $fetch<{ settings: Record<string, unknown> }>('/api/admin/settings'))
const adminToast = useAdminToast()
const saving = ref(false)
const testing = ref(false)
const mfaModuleEnabled = __PB_MODULE_MFA__
const securityAlertsModuleEnabled = __PB_MODULE_SECURITY_ALERTS__
const form = reactive({
  security_alerts_enabled: false,
  security_alert_webhook_url: '',
  security_alert_on_failed_login: false,
  security_alert_on_lockout: true,
  security_alert_on_new_login: false,
  security_mfa_required_for_admins: false
})

watch(data, (value) => {
  const settings = value?.settings ?? {}
  form.security_alerts_enabled = settings.security_alerts_enabled === true
  form.security_alert_webhook_url = typeof settings.security_alert_webhook_url === 'string' ? settings.security_alert_webhook_url : ''
  form.security_alert_on_failed_login = settings.security_alert_on_failed_login === true
  form.security_alert_on_lockout = settings.security_alert_on_lockout !== false
  form.security_alert_on_new_login = settings.security_alert_on_new_login === true
  form.security_mfa_required_for_admins = settings.security_mfa_required_for_admins === true
}, { immediate: true })

async function save() {
  saving.value = true

  try {
    const response = await $fetch<{ settings: Record<string, unknown> }>('/api/admin/settings', {
      method: 'POST',
      body: {
        ...(securityAlertsModuleEnabled
          ? {
              security_alerts_enabled: form.security_alerts_enabled,
              security_alert_webhook_url: form.security_alert_webhook_url.trim(),
              security_alert_on_failed_login: form.security_alert_on_failed_login,
              security_alert_on_lockout: form.security_alert_on_lockout,
              security_alert_on_new_login: form.security_alert_on_new_login
            }
          : {}),
        ...(mfaModuleEnabled ? { security_mfa_required_for_admins: form.security_mfa_required_for_admins } : {})
      }
    })
    data.value = response
    adminToast.success(t('admin.settings.security.saved'))
  } catch (err: any) {
    adminToast.error(err, t('admin.settings.security.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function sendTest() {
  testing.value = true

  try {
    await $fetch('/api/admin/settings/security/test-webhook', {
      method: 'POST',
      body: { url: form.security_alert_webhook_url.trim() }
    })
    adminToast.success(t('admin.settings.security.testSent'))
  } catch (err: any) {
    adminToast.error(err, t('admin.settings.security.testFailed'))
  } finally {
    testing.value = false
  }
}

// ---- Personal multi-factor authentication ---------------------------------
interface MfaStatus { enabled: boolean, enabled_at: string | null, backup_codes_remaining: number }
type MfaMode = 'idle' | 'enroll' | 'codes' | 'disable'

const mfaStatus = ref<MfaStatus | null>(null)
const mfaPending = ref(true)
const mfaMode = ref<MfaMode>('idle')
const mfaBusy = ref(false)
const mfaCode = ref('')
const disablePassword = ref('')
const enrollQr = ref('')
const enrollSecret = ref('')
const backupCodes = ref<string[]>([])

async function loadMfaStatus() {
  mfaPending.value = true
  try {
    mfaStatus.value = await $fetch<MfaStatus>('/api/admin/auth/mfa/status')
  } catch {
    mfaStatus.value = null
  } finally {
    mfaPending.value = false
  }
}

onMounted(() => {
  if (mfaModuleEnabled) {
    void loadMfaStatus()
  }
})

function resetMfaInputs() {
  mfaCode.value = ''
  disablePassword.value = ''
  enrollQr.value = ''
  enrollSecret.value = ''
}

async function beginEnroll() {
  mfaBusy.value = true
  resetMfaInputs()
  try {
    const response = await $fetch<{ secret: string, otpauth: string, qr: string }>('/api/admin/auth/mfa/setup', {
      method: 'POST'
    })
    enrollSecret.value = response.secret
    enrollQr.value = response.qr
    mfaMode.value = 'enroll'
  } catch (err: any) {
    adminToast.error(err, t('admin.settings.security.mfaError'))
  } finally {
    mfaBusy.value = false
  }
}

async function confirmEnroll() {
  mfaBusy.value = true
  try {
    const response = await $fetch<{ enabled: boolean, backup_codes: string[] }>('/api/admin/auth/mfa/activate', {
      method: 'POST',
      body: { code: mfaCode.value }
    })
    backupCodes.value = response.backup_codes ?? []
    mfaMode.value = 'codes'
  } catch (err: any) {
    adminToast.error(err, t('admin.settings.security.mfaError'))
  } finally {
    mfaBusy.value = false
  }
}

async function finishMfaFlow() {
  mfaMode.value = 'idle'
  backupCodes.value = []
  resetMfaInputs()
  await loadMfaStatus()
}

async function confirmDisable() {
  mfaBusy.value = true
  try {
    await $fetch('/api/admin/auth/mfa/disable', {
      method: 'POST',
      body: { password: disablePassword.value, code: mfaCode.value }
    })
    adminToast.success(t('admin.settings.security.mfaDisabled'))
    mfaMode.value = 'idle'
    resetMfaInputs()
    await loadMfaStatus()
  } catch (err: any) {
    adminToast.error(err, t('admin.settings.security.mfaError'))
  } finally {
    mfaBusy.value = false
  }
}

function cancelMfaFlow() {
  mfaMode.value = 'idle'
  resetMfaInputs()
}
</script>
