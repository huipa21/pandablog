<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.settings.system.eyebrow') }}</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('admin.settings.system.title') }}</h1>
      <p class="mt-2 max-w-2xl text-sm text-[var(--pb-text-muted)]">{{ t('admin.settings.system.description') }}</p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :title="t('admin.settings.system.saveFailed')" />

    <form class="grid gap-5 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]" @submit.prevent="save">
      <div v-if="pending" class="grid gap-4">
        <USkeleton class="h-10" />
        <USkeleton class="h-10" />
      </div>

      <template v-else>
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField :label="t('admin.settings.system.languageLabel')" name="admin_locale">
            <USelect v-model="form.admin_locale" :items="localeItems" class="w-full" />
          </UFormField>

          <UFormField :label="t('admin.settings.system.dateFormatLabel')" name="admin_date_format">
            <USelect v-model="form.admin_date_format" :items="dateFormatItems" class="w-full" />
          </UFormField>

          <UFormField :label="t('admin.settings.system.timezoneLabel')" name="admin_timezone">
            <USelectMenu v-model="form.admin_timezone" :items="timezoneItems" value-key="value" class="w-full" />
          </UFormField>

          <UFormField :label="t('admin.settings.system.formatLocaleLabel')" name="admin_format_locale">
            <USelectMenu v-model="form.admin_format_locale" :items="formatLocaleItems" value-key="value" class="w-full" />
          </UFormField>
        </div>

        <div class="flex justify-end">
          <UButton type="submit" icon="i-lucide-save" :loading="saving">{{ t('common.save') }}</UButton>
        </div>
      </template>
    </form>

    <section class="grid gap-4 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
      <div>
        <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.settings.system.buildTitle') }}</h2>
        <p class="mt-1 text-sm text-[var(--pb-text-muted)]">{{ t('admin.settings.system.buildDescription') }}</p>
      </div>

      <USkeleton v-if="buildPending" class="h-10" />
      <UAlert v-else-if="buildError" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="t('admin.settings.system.buildUnavailable')" />
      <dl v-else class="grid gap-3 sm:grid-cols-2">
        <div>
          <dt class="text-xs font-medium uppercase tracking-wider text-[var(--pb-text-muted)]">{{ t('admin.settings.system.buildVersion') }}</dt>
          <dd class="mt-1 font-mono text-sm text-[var(--pb-text)]">
            {{ build?.version || '—' }}
            <UBadge v-if="build?.dirty" color="warning" variant="subtle" size="sm" class="ml-2">{{ t('admin.settings.system.buildDirty') }}</UBadge>
          </dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wider text-[var(--pb-text-muted)]">{{ t('admin.settings.system.buildCommit') }}</dt>
          <dd class="mt-1 font-mono text-sm text-[var(--pb-text)]">{{ build?.commit || '—' }}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wider text-[var(--pb-text-muted)]">{{ t('admin.settings.system.buildRuntime') }}</dt>
          <dd class="mt-1 font-mono text-sm text-[var(--pb-text)]">{{ build?.node || '—' }}</dd>
        </div>
      </dl>
    </section>
  </section>
</template>

<script setup lang="ts">
import { ADMIN_LOCALE_KEY, DEFAULT_ADMIN_LOCALE, normalizeAdminLocale, type SupportedLocale } from '~/utils/adminLocale'
import {
  ADMIN_DATE_FORMAT_KEY,
  ADMIN_FORMAT_LOCALE_KEY,
  ADMIN_TIMEZONE_KEY,
  DEFAULT_ADMIN_DATE_FORMAT,
  DEFAULT_ADMIN_FORMAT_LOCALE,
  DEFAULT_ADMIN_TIMEZONE,
  getAdminFormatLocaleOptions,
  getAdminTimezoneOptions,
  normalizeAdminDateFormat,
  normalizeAdminFormatLocale,
  normalizeAdminTimezone,
  type AdminDateFormat,
  type AdminFormatLocale,
  type AdminTimezone
} from '~/utils/systemSettings'

definePageMeta({ layout: 'admin' })

const { t, locale, setLocale } = useI18n()
const sessionFetch = useSessionFetch()
const { data, pending, error } = await useAsyncData('admin-settings-system', () => sessionFetch<{ settings: Record<string, unknown> }>('/api/admin/settings'))
const { data: build, pending: buildPending, error: buildError } = await useAsyncData(
  'admin-settings-build',
  () => sessionFetch<{ version: string, commit: string | null, dirty: boolean, node: string }>('/api/admin/system/version')
)
const adminToast = useAdminToast()

const form = reactive({
  admin_locale: DEFAULT_ADMIN_LOCALE as SupportedLocale,
  admin_date_format: DEFAULT_ADMIN_DATE_FORMAT as AdminDateFormat,
  admin_timezone: DEFAULT_ADMIN_TIMEZONE as AdminTimezone,
  admin_format_locale: DEFAULT_ADMIN_FORMAT_LOCALE as AdminFormatLocale
})
const saving = ref(false)
const localeItems = computed(() => [
  { label: t('common.english'), value: 'en' },
  { label: t('common.simplifiedChinese'), value: 'zh-CN' }
])
const dateFormatItems = computed(() => [
  { label: t('admin.settings.system.dateFormats.iso8601'), value: 'iso-8601' },
  { label: t('admin.settings.system.dateFormats.yearMonthDaySlash'), value: 'yyyy-slash' },
  { label: t('admin.settings.system.dateFormats.monthDayYearSlash'), value: 'mdy-slash' },
  { label: t('admin.settings.system.dateFormats.dayMonthYearSlash'), value: 'dmy-slash' },
  { label: t('admin.settings.system.dateFormats.shortMonth'), value: 'short-month' },
  { label: t('admin.settings.system.dateFormats.longMonth'), value: 'long-month' },
  { label: t('admin.settings.system.dateFormats.longMonthOrdinal'), value: 'long-month-ordinal' }
])
const timezoneItems = computed(() => getAdminTimezoneOptions())
const formatLocaleItems = computed(() => getAdminFormatLocaleOptions(locale.value))

watch(data, (value) => {
  const settings = value?.settings ?? {}
  form.admin_locale = normalizeAdminLocale(settings[ADMIN_LOCALE_KEY]) ?? DEFAULT_ADMIN_LOCALE
  form.admin_date_format = normalizeAdminDateFormat(settings[ADMIN_DATE_FORMAT_KEY]) ?? DEFAULT_ADMIN_DATE_FORMAT
  form.admin_timezone = normalizeAdminTimezone(settings[ADMIN_TIMEZONE_KEY]) ?? DEFAULT_ADMIN_TIMEZONE
  form.admin_format_locale = normalizeAdminFormatLocale(settings[ADMIN_FORMAT_LOCALE_KEY]) ?? DEFAULT_ADMIN_FORMAT_LOCALE
}, { immediate: true })

async function save() {
  saving.value = true

  try {
    const response = await $fetch<{ settings: Record<string, unknown> }>('/api/admin/settings', {
      method: 'POST',
      body: {
        [ADMIN_LOCALE_KEY]: form.admin_locale,
        [ADMIN_DATE_FORMAT_KEY]: form.admin_date_format,
        [ADMIN_TIMEZONE_KEY]: form.admin_timezone,
        [ADMIN_FORMAT_LOCALE_KEY]: form.admin_format_locale
      }
    })
    data.value = response
    await setLocale(form.admin_locale)
    await refreshNuxtData('admin-layout-settings')
    adminToast.success(t('admin.settings.system.saved'))
  } catch (err: any) {
    adminToast.error(err, t('admin.settings.system.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>