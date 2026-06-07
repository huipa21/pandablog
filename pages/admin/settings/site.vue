<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Settings</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">Site</h1>
      <p class="mt-2 max-w-2xl text-sm text-[var(--pb-text-muted)]">Configure the public header, site identity, and browser icon.</p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load settings" />
    <UAlert v-if="saveError" color="error" icon="i-lucide-circle-alert" :title="saveError" />
    <UAlert v-if="notice" color="success" icon="i-lucide-check" :title="notice" />

    <form class="grid gap-5 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]" @submit.prevent="save">
      <div v-if="pending" class="grid gap-4">
        <USkeleton class="h-10" />
        <USkeleton class="h-10" />
        <USkeleton class="h-32" />
      </div>

      <template v-else>
        <UFormField label="Site title" name="site_title">
          <UInput v-model="form.site_title" icon="i-lucide-type" />
        </UFormField>

        <UFormField label="Subtitle" name="site_subtitle">
          <UInput v-model="form.site_subtitle" icon="i-lucide-text" />
        </UFormField>

        <MediaSettingField
          label="Logo"
          :model-value="form.site_logo"
          @update:model-value="form.site_logo = $event"
          @browse="openMediaPicker('site_logo')"
        />

        <MediaSettingField
          label="Hero photo"
          :model-value="form.site_banner"
          preview-class="h-52"
          :preview-style="heroPhotoPreviewStyle"
          @update:model-value="form.site_banner = $event"
          @browse="openMediaPicker('site_banner')"
        />

        <fieldset class="grid gap-4 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
          <legend class="px-1 text-sm font-medium text-[var(--pb-text-muted)]">Hero photo framing</legend>
          <div class="grid gap-4 md:grid-cols-2">
            <label class="grid gap-2 text-sm font-medium text-[var(--pb-text)]">
              <span class="flex items-center justify-between gap-3">
                <span>Height</span>
                <span class="text-xs text-[var(--pb-text-muted)]">{{ form.site_hero_height_vh }}vh</span>
              </span>
              <input v-model.number="form.site_hero_height_vh" type="range" min="18" max="58" step="1" class="accent-[var(--pb-primary)]">
            </label>

            <label class="grid gap-2 text-sm font-medium text-[var(--pb-text)]">
              <span class="flex items-center justify-between gap-3">
                <span>Photo size</span>
                <span class="text-xs text-[var(--pb-text-muted)]">{{ form.site_banner_zoom }}%</span>
              </span>
              <input v-model.number="form.site_banner_zoom" type="range" min="100" max="200" step="5" class="accent-[var(--pb-primary)]">
            </label>

            <label class="grid gap-2 text-sm font-medium text-[var(--pb-text)]">
              <span class="flex items-center justify-between gap-3">
                <span>Horizontal focus</span>
                <span class="text-xs text-[var(--pb-text-muted)]">{{ form.site_banner_position_x }}%</span>
              </span>
              <input v-model.number="form.site_banner_position_x" type="range" min="0" max="100" step="1" class="accent-[var(--pb-primary)]">
            </label>

            <label class="grid gap-2 text-sm font-medium text-[var(--pb-text)]">
              <span class="flex items-center justify-between gap-3">
                <span>Vertical focus</span>
                <span class="text-xs text-[var(--pb-text-muted)]">{{ form.site_banner_position_y }}%</span>
              </span>
              <input v-model.number="form.site_banner_position_y" type="range" min="0" max="100" step="1" class="accent-[var(--pb-primary)]">
            </label>
          </div>
        </fieldset>

        <MediaSettingField
          label="Favicon"
          :model-value="form.site_favicon"
          @update:model-value="form.site_favicon = $event"
          @browse="openMediaPicker('site_favicon')"
        />

        <fieldset class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
          <legend class="px-1 text-sm font-medium text-[var(--pb-text-muted)]">Network</legend>
          <label class="flex cursor-pointer items-start gap-3 text-sm">
            <input
              v-model="form.trust_proxy_headers"
              type="checkbox"
              class="mt-1 rounded border-[var(--pb-border-strong)]"
            >
            <span class="grid gap-1">
              <span class="font-medium text-[var(--pb-text)]">Trust reverse proxy headers</span>
              <span class="text-xs text-[var(--pb-text-muted)]">Use forwarded IP headers and secure unlock cookies when deployed behind an HTTPS reverse proxy.</span>
            </span>
          </label>
        </fieldset>

        <div class="flex justify-end">
          <UButton type="submit" icon="i-lucide-save" :loading="saving">Save site settings</UButton>
        </div>
      </template>
    </form>

    <MediaPicker
      :open="mediaPickerOpen"
      return-value="url"
      type-filter="image"
      @update:open="setMediaPickerOpen"
      @select="handleMediaPicked"
    />
  </section>
</template>

<script setup lang="ts">
import MediaPicker from '~/components/admin/media/MediaPicker.vue'
import MediaSettingField from '~/components/admin/media/MediaSettingField.vue'

definePageMeta({ layout: 'admin' })

type SiteAssetKey = 'site_logo' | 'site_banner' | 'site_favicon'

interface SiteSettingsForm {
  site_title: string
  site_subtitle: string
  site_logo: string
  site_banner: string
  site_banner_position_x: number
  site_banner_position_y: number
  site_banner_zoom: number
  site_hero_height_vh: number
  site_favicon: string
  trust_proxy_headers: boolean
}

const { data, pending, error } = await useAsyncData('admin-settings-site', () => $fetch<{ settings: Record<string, unknown> }>('/api/admin/settings'))

const form = reactive<SiteSettingsForm>({
  site_title: '',
  site_subtitle: '',
  site_logo: '',
  site_banner: '',
  site_banner_position_x: 50,
  site_banner_position_y: 50,
  site_banner_zoom: 100,
  site_hero_height_vh: 34,
  site_favicon: '',
  trust_proxy_headers: false
})
const mediaPickerOpen = ref(false)
const mediaPickerKey = ref<SiteAssetKey | null>(null)
const saving = ref(false)
const notice = ref('')
const saveError = ref('')

const heroPhotoPreviewStyle = computed(() => heroPhotoStyle({ height: `${Math.max(144, Math.round(form.site_hero_height_vh * 4.5))}px` }))

watch(data, (value) => {
  const settings = value?.settings ?? {}
  form.site_title = textValue(settings.site_title)
  form.site_subtitle = textValue(settings.site_subtitle)
  form.site_logo = textValue(settings.site_logo)
  form.site_banner = textValue(settings.site_banner)
  form.site_banner_position_x = numberValue(settings.site_banner_position_x, 50, 0, 100)
  form.site_banner_position_y = numberValue(settings.site_banner_position_y, 50, 0, 100)
  form.site_banner_zoom = numberValue(settings.site_banner_zoom, 100, 100, 200)
  form.site_hero_height_vh = numberValue(settings.site_hero_height_vh, 34, 18, 58)
  form.site_favicon = textValue(settings.site_favicon)
  form.trust_proxy_headers = settings.trust_proxy_headers === true
}, { immediate: true })

async function save() {
  saving.value = true
  notice.value = ''
  saveError.value = ''

  try {
    const response = await $fetch<{ settings: Record<string, unknown> }>('/api/admin/settings', {
      method: 'POST',
      body: { ...form }
    })
    data.value = response
    await refreshNuxtData('public-bootstrap')
    notice.value = 'Site settings saved'
  } catch (err: any) {
    saveError.value = err?.statusMessage ?? err?.message ?? 'Could not save site settings'
  } finally {
    saving.value = false
  }
}

function openMediaPicker(key: SiteAssetKey) {
  mediaPickerKey.value = key
  mediaPickerOpen.value = true
}

function setMediaPickerOpen(value: boolean) {
  mediaPickerOpen.value = value
  if (!value) {
    mediaPickerKey.value = null
  }
}

function handleMediaPicked(files: Array<{ url?: string }>) {
  const key = mediaPickerKey.value
  const url = files[0]?.url
  if (key && url) {
    form[key] = url
  }
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.min(max, Math.max(min, number))
}

function heroPhotoStyle(extra: Record<string, string> = {}) {
  return {
    objectPosition: `${form.site_banner_position_x}% ${form.site_banner_position_y}%`,
    transform: `scale(${form.site_banner_zoom / 100})`,
    transformOrigin: `${form.site_banner_position_x}% ${form.site_banner_position_y}%`,
    ...extra
  }
}
</script>
