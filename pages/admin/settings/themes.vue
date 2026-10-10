<template>
  <div class="space-y-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.settings.common.eyebrow') }}</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('admin.settings.themes.title') }}</h1>
      <p class="mt-2 text-sm text-[var(--pb-text-muted)]">{{ t('admin.settings.themes.description') }}</p>
      <p class="mt-2 text-sm text-[var(--pb-text-muted)]">{{ t('admin.settings.themes.deploymentHelp') }}</p>
    </header>

    <!-- Theme list -->
    <section>
      <h2 class="mb-3 font-medium text-[var(--pb-text)]">{{ t('admin.settings.themes.installed') }}</h2>
      <div v-if="pending">{{ t('admin.settings.themes.loading') }}</div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <article
          v-for="theme in data?.themes ?? []"
          :key="theme.id"
          class="flex flex-col overflow-hidden rounded-[var(--pb-radius-card-outer)] border transition-colors"
          :class="theme.id === data?.activeId ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)] ring-2 ring-[var(--pb-selected-border)]' : 'border-[var(--pb-card-border)] bg-[var(--pb-card-bg)]'"
        >
          <div class="aspect-[16/9] bg-[var(--pb-surface-subtle)]">
            <img
              :src="`/themes/${theme.id}/${theme.preview}`"
              :alt="t('admin.settings.themes.previewAlt', { name: theme.name })"
              class="w-full h-full object-cover"
              @error="(e: any) => (e.target.style.display = 'none')"
            />
          </div>
          <div class="p-3 flex-1 flex flex-col gap-2">
            <div>
              <h3 class="font-medium">{{ theme.name }}</h3>
              <p class="text-sm text-[var(--pb-text-subtle)]">v{{ theme.version }} · {{ theme.author }}</p>
              <p class="text-sm text-[var(--pb-text-muted)]">{{ theme.description }}</p>
            </div>
            <div class="mt-auto flex gap-2 pt-2">
              <button
                class="text-sm px-2 py-1 border rounded"
                @click="openPreview(theme.id)"
              >{{ t('admin.settings.themes.preview') }}</button>
              <button
                class="text-sm px-2 py-1 bg-[var(--pb-primary)] text-[var(--pb-primary-contrast)] rounded disabled:opacity-50"
                :disabled="theme.id === data?.activeId"
                @click="activate(theme.id)"
              >
                {{ theme.id === data?.activeId ? t('admin.settings.themes.active') : t('admin.settings.themes.activate') }}
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- Preview modal -->
    <div
      v-if="previewId"
      class="fixed inset-0 bg-black/60 z-50 flex flex-col"
      @click.self="previewId = null"
    >
      <div class="bg-white p-2 flex items-center justify-between">
        <span class="font-medium px-2">{{ t('admin.settings.themes.previewTitle', { id: previewId }) }}</span>
        <div class="flex gap-2">
          <button
            class="px-3 py-1 bg-blue-600 text-white rounded"
            @click="activate(previewId); previewId = null"
          >{{ t('admin.settings.themes.publishTheme') }}</button>
          <button class="px-3 py-1 border rounded" @click="previewId = null">{{ t('admin.settings.themes.close') }}</button>
        </div>
      </div>
      <iframe
        :src="`/?theme=${previewId}`"
        class="flex-1 bg-white"
        sandbox="allow-same-origin allow-scripts"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ThemeManifest } from '~/server/utils/theme-validator'

definePageMeta({ layout: 'admin' })

const { t } = useI18n()

const { data, pending, refresh } = await useFetch<{ themes: ThemeManifest[], activeId: string }>('/api/admin/themes')

const adminToast = useAdminToast()
const previewId = ref<string | null>(null)

async function activate(themeId: string) {
  try {
    await $fetch('/api/admin/themes/activate', { method: 'POST', body: { themeId } })
    refreshThemeStylesheet(themeId)
    await refresh()
    adminToast.success(t('admin.settings.themes.activated'))
  } catch (err: any) {
    adminToast.error(err, t('admin.settings.themes.activateFailed'))
  }
}

function refreshThemeStylesheet(themeId: string) {
  if (!import.meta.client) return
  const link = document.querySelector<HTMLLinkElement>('link[data-theme-stylesheet="true"]')
  if (link) {
    const params = new URLSearchParams({ theme: themeId, v: String(Date.now()) })
    link.href = `/api/theme/css?${params.toString()}`
  }
}

function openPreview(themeId: string) {
  previewId.value = themeId
}
</script>
