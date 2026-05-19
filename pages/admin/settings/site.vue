<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-teal-700">Settings</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-stone-950">Site</h1>
      <p class="mt-2 max-w-2xl text-sm text-stone-600">Configure the public header, site identity, and browser icon.</p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load settings" />
    <UAlert v-if="saveError" color="error" icon="i-lucide-circle-alert" :title="saveError" />
    <UAlert v-if="notice" color="success" icon="i-lucide-check" :title="notice" />

    <form class="grid gap-5 rounded-lg border border-stone-200 bg-white p-5 shadow-sm" @submit.prevent="save">
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
          :loading="uploading.site_logo"
          @update:model-value="form.site_logo = $event"
          @upload="logoInput?.click()"
        />
        <input ref="logoInput" type="file" accept="image/*" class="hidden" @change="uploadImage($event, 'site_logo')">

        <MediaSettingField
          label="Header banner"
          :model-value="form.site_banner"
          :loading="uploading.site_banner"
          @update:model-value="form.site_banner = $event"
          @upload="bannerInput?.click()"
        />
        <input ref="bannerInput" type="file" accept="image/*" class="hidden" @change="uploadImage($event, 'site_banner')">

        <MediaSettingField
          label="Favicon"
          :model-value="form.site_favicon"
          :loading="uploading.site_favicon"
          @update:model-value="form.site_favicon = $event"
          @upload="faviconInput?.click()"
        />
        <input ref="faviconInput" type="file" accept="image/*" class="hidden" @change="uploadImage($event, 'site_favicon')">

        <div class="flex justify-end">
          <UButton type="submit" icon="i-lucide-save" :loading="saving">Save site settings</UButton>
        </div>
      </template>
    </form>
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

type SiteSettingKey = 'site_title' | 'site_subtitle' | 'site_logo' | 'site_banner' | 'site_favicon'

const { data, pending, error } = await useAsyncData('admin-settings-site', () => $fetch<{ settings: Record<string, unknown> }>('/api/admin/settings'))

const form = reactive<Record<SiteSettingKey, string>>({
  site_title: '',
  site_subtitle: '',
  site_logo: '',
  site_banner: '',
  site_favicon: ''
})
const uploading = reactive<Record<SiteSettingKey, boolean>>({
  site_title: false,
  site_subtitle: false,
  site_logo: false,
  site_banner: false,
  site_favicon: false
})
const logoInput = ref<HTMLInputElement | null>(null)
const bannerInput = ref<HTMLInputElement | null>(null)
const faviconInput = ref<HTMLInputElement | null>(null)
const saving = ref(false)
const notice = ref('')
const saveError = ref('')

watch(data, (value) => {
  const settings = value?.settings ?? {}
  form.site_title = textValue(settings.site_title)
  form.site_subtitle = textValue(settings.site_subtitle)
  form.site_logo = textValue(settings.site_logo)
  form.site_banner = textValue(settings.site_banner)
  form.site_favicon = textValue(settings.site_favicon)
}, { immediate: true })

async function save() {
  saving.value = true
  notice.value = ''
  saveError.value = ''

  try {
    await $fetch('/api/admin/settings', {
      method: 'POST',
      body: { ...form }
    })
    notice.value = 'Site settings saved'
  } catch (err: any) {
    saveError.value = err?.statusMessage ?? err?.message ?? 'Could not save site settings'
  } finally {
    saving.value = false
  }
}

async function uploadImage(event: Event, key: SiteSettingKey) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  uploading[key] = true
  saveError.value = ''
  try {
    const body = new FormData()
    body.append('file', file)
    const asset = await $fetch<{ url?: string }>('/api/admin/upload', {
      method: 'POST',
      body
    })
    if (asset.url) {
      form[key] = asset.url
    }
  } catch (err: any) {
    saveError.value = err?.statusMessage ?? err?.message ?? 'Upload failed'
  } finally {
    uploading[key] = false
  }
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}
</script>
