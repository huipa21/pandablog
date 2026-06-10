<template>
  <div class="space-y-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.settings.common.eyebrow') }}</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('admin.settings.themes.title') }}</h1>
      <p class="mt-2 text-sm text-[var(--pb-text-muted)]">{{ t('admin.settings.themes.description') }}</p>
    </header>

    <!-- Upload -->
    <section class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
      <h2 class="mb-2 font-medium text-[var(--pb-text)]">{{ t('admin.settings.themes.uploadTitle') }}</h2>
      <form class="flex items-center gap-3" @submit.prevent="onUpload">
        <input ref="fileInput" type="file" accept=".zip" class="rounded-[var(--pb-radius-sm)] border border-[var(--pb-border)] px-2 py-1" />
        <UButton
          type="submit"
          icon="i-lucide-upload"
          :disabled="uploading"
        >
          {{ uploading ? t('admin.settings.themes.uploading') : t('admin.settings.themes.uploadZip') }}
        </UButton>
      </form>
    </section>

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
              <button
                v-if="!isBuiltInTheme(theme.id) && theme.id !== data?.activeId"
                class="text-sm px-2 py-1 border border-red-300 text-red-600 rounded"
                @click="requestRemove(theme.id)"
              >{{ t('admin.settings.themes.delete') }}</button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <AdminConfirmActionDialog
      :open="deleteDialogOpen"
      :title="t('admin.settings.themes.deleteTitle')"
      :description="deleteDialogDescription"
      :confirm-label="t('admin.settings.themes.delete')"
      confirm-color="error"
      :loading="deleting"
      @update:open="(value) => { if (!value) closeDeleteDialog() }"
      @cancel="closeDeleteDialog"
      @confirm="confirmRemove"
    />

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
definePageMeta({ layout: 'admin' })

const { t } = useI18n()

const { data, pending, refresh } = await useFetch('/api/admin/themes')

const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)
const deleting = ref(false)
const adminToast = useAdminToast()

const previewId = ref<string | null>(null)
const deleteDialogOpen = ref(false)
const pendingDeleteThemeId = ref<string | null>(null)
const builtInThemeIds = new Set(['default', 'tesla', 'notion', 'clay'])
const deleteDialogDescription = computed(() => pendingDeleteThemeId.value
  ? t('admin.settings.themes.deleteDescription', { id: pendingDeleteThemeId.value })
  : t('admin.settings.themes.deleteFallback'))

function isBuiltInTheme(themeId: string) {
  return builtInThemeIds.has(themeId)
}

async function onUpload() {
  const file = fileInput.value?.files?.[0]
  if (!file) {
    adminToast.error(new Error(t('admin.settings.themes.pickZip')), t('admin.settings.themes.pickZip'))
    return
  }

  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('theme', file)
    const res = await $fetch<{ ok: boolean, themeId: string }>('/api/admin/themes/upload', {
      method: 'POST',
      body: formData
    })
    adminToast.success(t('admin.settings.themes.installedToast', { id: res.themeId }))
    if (fileInput.value) fileInput.value.value = ''
    await refresh()
  } catch (err: any) {
    adminToast.error(err, t('admin.settings.themes.uploadFailed'))
  } finally {
    uploading.value = false
  }
}

async function activate(themeId: string) {
  try {
    await $fetch('/api/admin/themes/activate', { method: 'POST', body: { themeId } })
    refreshThemeStylesheet()
    await refresh()
    adminToast.success(t('admin.settings.themes.activated'))
  } catch (err: any) {
    adminToast.error(err, t('admin.settings.themes.activateFailed'))
  }
}

function refreshThemeStylesheet() {
  if (!import.meta.client) return
  const link = document.querySelector<HTMLLinkElement>('link[data-theme-stylesheet="true"]')
  if (link) {
    link.href = `/api/theme/css?t=${Date.now()}`
  }
}

function requestRemove(themeId: string) {
  pendingDeleteThemeId.value = themeId
  deleteDialogOpen.value = true
}

function closeDeleteDialog() {
  if (deleting.value) {
    return
  }

  deleteDialogOpen.value = false
  pendingDeleteThemeId.value = null
}

async function confirmRemove() {
  const themeId = pendingDeleteThemeId.value
  if (!themeId) {
    closeDeleteDialog()
    return
  }

  deleting.value = true
  try {
    await $fetch(`/api/admin/themes/${themeId}`, { method: 'DELETE' })
    await refresh()
    closeDeleteDialog()
    adminToast.success(t('admin.settings.themes.deleted'))
  } catch (err: any) {
    adminToast.error(err, t('admin.settings.themes.deleteFailed'))
  } finally {
    deleting.value = false
  }
}

function openPreview(themeId: string) {
  previewId.value = themeId
}
</script>
