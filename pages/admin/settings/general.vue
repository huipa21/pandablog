<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Settings</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">General</h1>
      <p class="mt-2 max-w-2xl text-sm text-[var(--pb-text-muted)]">Configure your site identity, footer, and public access mode.</p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load settings" />
    <UAlert v-if="saveError" color="error" icon="i-lucide-circle-alert" :title="saveError" />
    <UAlert v-if="notice" color="success" icon="i-lucide-check" :title="notice" />

    <form class="grid gap-6" @submit.prevent="save">
      <div v-if="pending" class="grid gap-5">
        <section v-for="section in 3" :key="section" class="grid gap-4 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
          <USkeleton class="h-8 w-40" />
          <USkeleton class="h-10" />
          <USkeleton class="h-24" />
        </section>
      </div>

      <template v-else>
        <section class="grid gap-5 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
          <div>
            <h2 class="text-xl font-semibold tracking-normal text-[var(--pb-text)]">Header</h2>
            <p class="mt-1 text-sm text-[var(--pb-text-muted)]">Configure the public header, site identity, and browser icon.</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="Site title" name="site_title">
              <UInput v-model="form.site_title" icon="i-lucide-type" class="w-full" />
            </UFormField>

            <UFormField label="Subtitle" name="site_subtitle">
              <UInput v-model="form.site_subtitle" icon="i-lucide-text" class="w-full" />
            </UFormField>
          </div>

          <div class="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
            <div class="grid gap-5">
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
            </div>

            <div class="grid content-start gap-5">
              <MediaSettingField
                label="Logo"
                :model-value="form.site_logo"
                @update:model-value="form.site_logo = $event"
                @browse="openMediaPicker('site_logo')"
              />

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
            </div>
          </div>
        </section>

        <section class="grid gap-5 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
          <div>
            <h2 class="text-xl font-semibold tracking-normal text-[var(--pb-text)]">Footer</h2>
            <p class="mt-1 text-sm text-[var(--pb-text-muted)]">Configure copyright text, footer links, social icon links, and optional filing information.</p>
          </div>

          <UFormField label="Copyright" name="footer_copyright">
            <UInput v-model="form.footer_copyright" icon="i-lucide-copyright" placeholder="© 2026 Your Site. All rights reserved." class="w-full" />
          </UFormField>

          <section class="grid gap-3">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-base font-semibold text-[var(--pb-text)]">Footer links</h3>
              <UButton type="button" icon="i-lucide-plus" variant="soft" size="sm" @click="addFooterLink">Add link</UButton>
            </div>
            <div v-if="form.footer_links.length" class="grid gap-3">
              <div v-for="(link, index) in form.footer_links" :key="index" class="grid gap-2 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3 md:grid-cols-[1fr_1.6fr_auto]">
                <UInput v-model="link.label" placeholder="Label" icon="i-lucide-type" />
                <UInput v-model="link.url" placeholder="/about or https://..." icon="i-lucide-link" />
                <UButton type="button" icon="i-lucide-trash-2" color="error" variant="ghost" @click="removeFooterLink(index)" />
              </div>
            </div>
            <p v-else class="rounded-[var(--pb-radius-card-inner)] border border-dashed border-[var(--pb-divider-strong)] p-4 text-sm text-[var(--pb-text-subtle)]">No footer links yet.</p>
          </section>

          <section class="grid gap-3">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-base font-semibold text-[var(--pb-text)]">Social links</h3>
              <UButton type="button" icon="i-lucide-plus" variant="soft" size="sm" @click="addSocialLink">Add social</UButton>
            </div>
            <div v-if="form.footer_social.length" class="grid gap-3">
              <div v-for="(link, index) in form.footer_social" :key="index" class="grid gap-2 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3 md:grid-cols-[1fr_1fr_1.6fr_auto]">
                <UInput v-model="link.label" placeholder="Label" icon="i-lucide-type" />
                <UInput v-model="link.icon" placeholder="i-lucide-github" icon="i-lucide-smile" />
                <UInput v-model="link.url" placeholder="https://..." icon="i-lucide-link" />
                <UButton type="button" icon="i-lucide-trash-2" color="error" variant="ghost" @click="removeSocialLink(index)" />
              </div>
            </div>
            <p v-else class="rounded-[var(--pb-radius-card-inner)] border border-dashed border-[var(--pb-divider-strong)] p-4 text-sm text-[var(--pb-text-subtle)]">No social links yet.</p>
          </section>

          <section class="grid gap-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-base font-semibold text-[var(--pb-text)]">Filings</h3>
                <p class="mt-1 text-sm text-[var(--pb-text-muted)]">Add optional filing text and links shown in the public footer.</p>
              </div>
              <UButton type="button" icon="i-lucide-plus" variant="soft" size="sm" @click="addFiling">Add filing</UButton>
            </div>
            <div v-if="form.footer_filings.length" class="grid gap-3">
              <div v-for="(filing, index) in form.footer_filings" :key="index" class="grid gap-2 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3 md:grid-cols-[1fr_1.6fr_1fr_auto] md:items-start">
                <UInput v-model="filing.label" placeholder="Displayed filing text" icon="i-lucide-type" />
                <UInput v-model="filing.url" placeholder="https://..." icon="i-lucide-link" />
                <div class="grid gap-2">
                  <USelect v-model="filing.iconPreset" :items="filingIconOptions" icon="i-lucide-badge-check" class="w-full" />
                  <UInput v-if="filing.iconPreset === 'custom'" v-model="filing.customIcon" placeholder="i-lucide-shield or https://..." icon="i-lucide-image" />
                </div>
                <UButton type="button" icon="i-lucide-trash-2" color="error" variant="ghost" @click="removeFiling(index)" />
              </div>
            </div>
            <p v-else class="rounded-[var(--pb-radius-card-inner)] border border-dashed border-[var(--pb-divider-strong)] p-4 text-sm text-[var(--pb-text-subtle)]">No filings yet.</p>
          </section>
        </section>

        <section class="grid gap-5 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
          <div>
            <h2 class="text-xl font-semibold tracking-normal text-[var(--pb-text)]">Site visibility</h2>
            <p class="mt-1 text-sm text-[var(--pb-text-muted)]">Controls whether the public site is reachable to anonymous visitors.</p>
          </div>

          <fieldset class="grid gap-3 md:grid-cols-2">
            <label class="flex cursor-pointer items-start gap-3 rounded-[var(--pb-radius-card-inner)] border p-3" :class="form.mode === 'public' ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)]' : 'border-[var(--pb-divider)]'">
              <input v-model="form.mode" type="radio" value="public" class="mt-1">
              <span class="grid gap-1">
                <span class="font-medium text-[var(--pb-text)]">Public</span>
                <span class="text-sm text-[var(--pb-text-muted)]">Anyone can browse the site. Per-post visibility still applies.</span>
              </span>
            </label>

            <label class="flex cursor-pointer items-start gap-3 rounded-[var(--pb-radius-card-inner)] border p-3" :class="form.mode === 'private' ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)]' : 'border-[var(--pb-divider)]'">
              <input v-model="form.mode" type="radio" value="private" class="mt-1">
              <span class="grid gap-1">
                <span class="font-medium text-[var(--pb-text)]">Private</span>
                <span class="text-sm text-[var(--pb-text-muted)]">Only logged-in admins can browse. Anonymous visitors are sent to login.</span>
              </span>
            </label>
          </fieldset>
        </section>

        <div class="flex justify-end">
          <UButton type="submit" icon="i-lucide-save" :loading="saving">Save settings</UButton>
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
type SiteVisibility = 'public' | 'private'
type FilingIconPreset = 'none' | 'emblem' | 'shield' | 'custom'

interface FooterLink {
  label: string
  url: string
  icon?: string
}

interface FilingLink {
  label: string
  url: string
  iconPreset: FilingIconPreset
  customIcon: string
}

interface GeneralSettingsForm {
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
  footer_copyright: string
  footer_links: FooterLink[]
  footer_social: FooterLink[]
  footer_filings: FilingLink[]
  mode: SiteVisibility
}

const FILING_EMBLEM_ICON = '/defaults/icp-emblem.svg'
const FILING_SHIELD_ICON = 'i-lucide-shield-check'
const filingIconOptions: Array<{ label: string, value: FilingIconPreset }> = [
  { label: 'None', value: 'none' },
  { label: 'National emblem', value: 'emblem' },
  { label: 'Shield', value: 'shield' },
  { label: 'Custom URL', value: 'custom' }
]

const { data, pending, error } = await useAsyncData('admin-settings-general', async () => {
  const [settingsResponse, visibilityResponse] = await Promise.all([
    $fetch<{ settings: Record<string, unknown> }>('/api/admin/settings'),
    $fetch<{ mode: SiteVisibility }>('/api/admin/site/visibility')
  ])

  return {
    settings: settingsResponse.settings,
    mode: visibilityResponse.mode
  }
})

const form = reactive<GeneralSettingsForm>({
  site_title: '',
  site_subtitle: '',
  site_logo: '',
  site_banner: '',
  site_banner_position_x: 50,
  site_banner_position_y: 50,
  site_banner_zoom: 100,
  site_hero_height_vh: 34,
  site_favicon: '',
  trust_proxy_headers: false,
  footer_copyright: '',
  footer_links: [],
  footer_social: [],
  footer_filings: [],
  mode: 'public'
})
const mediaPickerOpen = ref(false)
const mediaPickerKey = ref<SiteAssetKey | null>(null)
const initialMode = ref<SiteVisibility>('public')
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
  form.footer_copyright = textValue(settings.footer_copyright)
  form.footer_links = linksValue(settings.footer_links)
  form.footer_social = linksValue(settings.footer_social)
  form.footer_filings = filingsValue(settings.footer_filings)
  form.mode = value?.mode === 'private' ? 'private' : 'public'
  initialMode.value = form.mode
}, { immediate: true })

function addFooterLink() {
  form.footer_links.push({ label: '', url: '' })
}

function removeFooterLink(index: number) {
  form.footer_links.splice(index, 1)
}

function addSocialLink() {
  form.footer_social.push({ label: '', icon: 'i-lucide-link', url: '' })
}

function removeSocialLink(index: number) {
  form.footer_social.splice(index, 1)
}

function addFiling() {
  form.footer_filings.push({ label: '', url: '', iconPreset: 'emblem', customIcon: '' })
}

function removeFiling(index: number) {
  form.footer_filings.splice(index, 1)
}

async function save() {
  saving.value = true
  notice.value = ''
  saveError.value = ''

  try {
    const settingsBody = {
      site_title: form.site_title,
      site_subtitle: form.site_subtitle,
      site_logo: form.site_logo,
      site_banner: form.site_banner,
      site_banner_position_x: form.site_banner_position_x,
      site_banner_position_y: form.site_banner_position_y,
      site_banner_zoom: form.site_banner_zoom,
      site_hero_height_vh: form.site_hero_height_vh,
      site_favicon: form.site_favicon,
      trust_proxy_headers: form.trust_proxy_headers,
      footer_copyright: form.footer_copyright,
      footer_links: cleanLinks(form.footer_links),
      footer_social: cleanLinks(form.footer_social),
      footer_filings: cleanLinks(form.footer_filings.map((filing) => ({
        label: filing.label,
        url: filing.url,
        icon: iconValueForFiling(filing)
      })))
    }
    const [settingsResponse, visibilityResponse] = await Promise.all([
      $fetch<{ settings: Record<string, unknown> }>('/api/admin/settings', {
        method: 'POST',
        body: settingsBody
      }),
      form.mode !== initialMode.value
        ? $fetch<{ mode: SiteVisibility }>('/api/admin/site/visibility', {
            method: 'POST',
            body: { mode: form.mode }
          })
        : Promise.resolve({ mode: form.mode })
    ])

    data.value = {
      settings: settingsResponse.settings,
      mode: visibilityResponse.mode
    }
    await refreshNuxtData('public-bootstrap')
    notice.value = 'Settings saved'
  } catch (err: any) {
    saveError.value = err?.statusMessage ?? err?.message ?? 'Could not save settings'
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

function cleanLinks(links: FooterLink[]) {
  return links
    .map((link) => ({
      label: link.label.trim(),
      url: link.url.trim(),
      icon: link.icon?.trim()
    }))
    .filter((link) => link.label && link.url)
}

function linksValue(value: unknown): FooterLink[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => {
    const link = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    return {
      label: textValue(link.label),
      url: textValue(link.url),
      icon: textValue(link.icon)
    }
  })
}

function filingsValue(value: unknown): FilingLink[] {
  return linksValue(value).map((link) => ({
    label: link.label,
    url: link.url,
    ...filingIconState(link.icon)
  }))
}

function iconValueForFiling(filing: FilingLink) {
  if (filing.iconPreset === 'emblem') {
    return FILING_EMBLEM_ICON
  }

  if (filing.iconPreset === 'shield') {
    return FILING_SHIELD_ICON
  }

  if (filing.iconPreset === 'custom') {
    return filing.customIcon.trim()
  }

  return ''
}

function filingIconState(icon: string | undefined): Pick<FilingLink, 'iconPreset' | 'customIcon'> {
  if (icon === FILING_EMBLEM_ICON) {
    return { iconPreset: 'emblem', customIcon: '' }
  }

  if (icon === FILING_SHIELD_ICON) {
    return { iconPreset: 'shield', customIcon: '' }
  }

  if (icon) {
    return { iconPreset: 'custom', customIcon: icon }
  }

  return { iconPreset: 'none', customIcon: '' }
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