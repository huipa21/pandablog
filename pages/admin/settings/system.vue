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
        <header class="grid gap-1">
          <h2 class="text-xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('admin.settings.system.languageTitle') }}</h2>
          <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.settings.system.languageDescription') }}</p>
        </header>

        <UFormField :label="t('admin.settings.system.languageLabel')" name="admin_locale">
          <USelect v-model="form.admin_locale" :items="localeItems" class="max-w-sm" />
        </UFormField>

        <div class="flex justify-end">
          <UButton type="submit" icon="i-lucide-save" :loading="saving">{{ t('common.save') }}</UButton>
        </div>
      </template>
    </form>
  </section>
</template>

<script setup lang="ts">
import { ADMIN_LOCALE_KEY, DEFAULT_ADMIN_LOCALE, normalizeAdminLocale, type SupportedLocale } from '~/utils/adminLocale'

definePageMeta({ layout: 'admin' })

const { t, setLocale } = useI18n()
const { data, pending, error } = await useAsyncData('admin-settings-system', () => $fetch<{ settings: Record<string, unknown> }>('/api/admin/settings'))
const adminToast = useAdminToast()

const form = reactive({
  admin_locale: DEFAULT_ADMIN_LOCALE as SupportedLocale
})
const saving = ref(false)
const localeItems = computed(() => [
  { label: t('common.english'), value: 'en' },
  { label: t('common.simplifiedChinese'), value: 'zh-CN' }
])

watch(data, (value) => {
  form.admin_locale = normalizeAdminLocale(value?.settings?.[ADMIN_LOCALE_KEY]) ?? DEFAULT_ADMIN_LOCALE
}, { immediate: true })

async function save() {
  saving.value = true

  try {
    const response = await $fetch<{ settings: Record<string, unknown> }>('/api/admin/settings', {
      method: 'POST',
      body: { [ADMIN_LOCALE_KEY]: form.admin_locale }
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