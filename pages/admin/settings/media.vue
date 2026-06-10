<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.settings.common.eyebrow') }}</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('admin.settings.media.title') }}</h1>
      <p class="mt-2 max-w-2xl text-sm text-[var(--pb-text-muted)]">{{ t('admin.settings.media.description') }}</p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :title="t('admin.settings.common.loadFailed')" />

    <form class="grid gap-5 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]" @submit.prevent="save">
      <div v-if="pending" class="grid gap-4">
        <USkeleton class="h-10" />
        <USkeleton class="h-10" />
        <USkeleton class="h-32" />
      </div>

      <template v-else>
        <!-- File Size Limit -->
        <UFormField :label="t('admin.settings.media.maxFileSize')" name="max_file_size_mb">
          <UInput
            v-model.number="form.max_file_size_mb"
            type="number"
            min="1"
            max="100"
            icon="i-lucide-hard-drive"
          />
          <template #hint>
            {{ t('admin.settings.media.maxFileSizeHint') }}
          </template>
        </UFormField>

        <!-- Max Files Per Upload -->
        <UFormField :label="t('admin.settings.media.maxFilesPerUpload')" name="max_files_per_upload">
          <UInput
            v-model.number="form.max_files_per_upload"
            type="number"
            min="1"
            max="20"
            icon="i-lucide-files"
          />
          <template #hint>
            {{ t('admin.settings.media.maxFilesPerUploadHint') }}
          </template>
        </UFormField>

        <!-- Allowed Extensions -->
        <fieldset class="space-y-3 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
          <legend class="mb-3 text-sm font-medium text-[var(--pb-text-muted)]">{{ t('admin.settings.media.allowedTypes') }}</legend>

          <!-- Preset groups -->
          <div class="mb-4 space-y-2 border-b border-[var(--pb-divider)] pb-4">
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                :checked="hasAllImages"
                @change="toggleAllImages"
                class="rounded border-[var(--pb-border-strong)]"
              >
              <span>{{ t('admin.settings.media.imagesPreset') }}</span>
            </label>
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                :checked="hasAllDocuments"
                @change="toggleAllDocuments"
                class="rounded border-[var(--pb-border-strong)]"
              >
              <span>{{ t('admin.settings.media.documentsPreset') }}</span>
            </label>
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                :checked="hasArchives"
                @change="toggleArchives"
                class="rounded border-[var(--pb-border-strong)]"
              >
              <span>{{ t('admin.settings.media.archivesPreset') }}</span>
            </label>
          </div>

          <!-- Individual extensions -->
          <div class="space-y-2">
            <div class="text-xs font-medium uppercase text-[var(--pb-text-muted)]">{{ t('admin.settings.media.customSelection') }}</div>
            <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
              <label
                v-for="ext in allExtensions"
                :key="ext"
                class="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  v-model="form.allowed_extensions"
                  type="checkbox"
                  :value="ext"
                  class="rounded border-[var(--pb-border-strong)]"
                >
                <span>.{{ ext.toUpperCase() }}</span>
              </label>
            </div>
          </div>
        </fieldset>

        <!-- Perceptual Deduplication -->
        <fieldset class="space-y-3 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
          <legend class="text-sm font-medium text-[var(--pb-text-muted)]">{{ t('admin.settings.media.imageDedup') }}</legend>

          <label class="flex items-center gap-2">
            <input
              v-model="form.enable_perceptual_dedup"
              type="checkbox"
              class="rounded border-[var(--pb-border-strong)]"
            >
            <div>
              <div class="text-sm font-medium text-[var(--pb-text)]">{{ t('admin.settings.media.enablePerceptualHashing') }}</div>
              <div class="text-xs text-[var(--pb-text-muted)]">{{ t('admin.settings.media.perceptualHashingHelp') }}</div>
            </div>
          </label>

          <template v-if="form.enable_perceptual_dedup">
            <div class="ml-6 space-y-2">
              <label class="text-sm font-medium text-[var(--pb-text-muted)]">{{ t('admin.settings.media.sensitivityThreshold') }}</label>
              <div class="flex items-center gap-4">
                <input
                  v-model.number="form.perceptual_dedup_threshold"
                  type="range"
                  min="0"
                  max="20"
                  class="flex-1"
                >
                <span class="w-8 text-sm font-medium text-[var(--pb-text)]">{{ form.perceptual_dedup_threshold }}</span>
              </div>
              <p class="text-xs text-[var(--pb-text-muted)]">
                <template v-if="form.perceptual_dedup_threshold <= 5">{{ t('admin.settings.media.thresholdStrict') }}</template>
                <template v-else-if="form.perceptual_dedup_threshold <= 10">{{ t('admin.settings.media.thresholdBalanced') }}</template>
                <template v-else>{{ t('admin.settings.media.thresholdLoose') }}</template>
              </p>
            </div>
          </template>
        </fieldset>

        <!-- Actions -->
        <UFormField :label="t('admin.settings.media.downloadCleanupHours')" name="download_cleanup_hours">
          <UInput
            v-model.number="form.download_cleanup_hours"
            type="number"
            min="1"
            max="168"
            icon="i-lucide-clock"
          />
          <template #hint>
            {{ t('admin.settings.media.downloadCleanupHint') }}
          </template>
        </UFormField>

        <fieldset class="space-y-4 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
          <legend class="text-sm font-medium text-[var(--pb-text-muted)]">{{ t('admin.settings.media.delivery') }}</legend>

          <UFormField :label="t('admin.settings.media.publicBaseUrl')" name="public_base_url">
            <UInput v-model="form.public_base_url" placeholder="https://media.example.com" icon="i-lucide-globe" />
            <template #hint>
              {{ t('admin.settings.media.publicBaseUrlHint') }}
            </template>
          </UFormField>

          <label class="flex cursor-pointer items-start gap-3 text-sm">
            <input
              v-model="form.local_only"
              type="checkbox"
              class="mt-1 rounded border-[var(--pb-border-strong)]"
            >
            <span class="grid gap-1">
              <span class="font-medium text-[var(--pb-text)]">{{ t('admin.settings.media.localOnly') }}</span>
              <span class="text-xs text-[var(--pb-text-muted)]">{{ t('admin.settings.media.localOnlyHelp') }}</span>
            </span>
          </label>
        </fieldset>

        <fieldset class="space-y-4 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
          <legend class="text-sm font-medium text-[var(--pb-text-muted)]">{{ t('admin.settings.media.orphanCleanup') }}</legend>

          <label class="flex cursor-pointer items-start gap-3 text-sm">
            <input
              v-model="form.orphan_cleanup_enabled"
              type="checkbox"
              class="mt-1 rounded border-[var(--pb-border-strong)]"
            >
            <span class="grid gap-1">
              <span class="font-medium text-[var(--pb-text)]">{{ t('admin.settings.media.enableCleanup') }}</span>
              <span class="text-xs text-[var(--pb-text-muted)]">{{ t('admin.settings.media.enableCleanupHelp') }}</span>
            </span>
          </label>

          <div class="grid gap-4 md:grid-cols-2">
            <UFormField :label="t('admin.settings.media.orphanAge')" name="orphan_cleanup_days">
              <UInput v-model.number="form.orphan_cleanup_days" type="number" min="1" max="3650" icon="i-lucide-calendar-clock" />
            </UFormField>

            <UFormField :label="t('admin.settings.media.cleanupCron')" name="orphan_cleanup_cron">
              <UInput v-model="form.orphan_cleanup_cron" icon="i-lucide-clock-3" />
            </UFormField>
          </div>
        </fieldset>

        <!-- Save / Cancel -->
        <div class="flex gap-3 pt-4">
          <UButton type="submit" icon="i-lucide-save" :loading="saving">
            {{ t('admin.settings.media.saveSettings') }}
          </UButton>
          <UButton type="button" color="neutral" variant="ghost" @click="resetForm">
            {{ t('admin.common.cancel') }}
          </UButton>
        </div>
      </template>
    </form>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'

interface MediaSettings {
  allowed_extensions: string[]
  max_file_size_mb: number
  max_files_per_upload: number
  enable_perceptual_dedup: boolean
  perceptual_dedup_threshold: number
  download_cleanup_hours: number
  public_base_url: string
  local_only: boolean
  orphan_cleanup_enabled: boolean
  orphan_cleanup_days: number
  orphan_cleanup_cron: string
}

definePageMeta({ layout: 'admin' })

const { t } = useI18n()

const allExtensions = [
  'jpg', 'jpeg', 'png', 'gif', 'webp',
  'pdf',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip'
]

const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp']
const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']
const archiveExtensions = ['zip']

const pending = ref(true)
const saving = ref(false)
const error = ref('')
const adminToast = useAdminToast()

const form = reactive<MediaSettings>({
  allowed_extensions: [],
  max_file_size_mb: 10,
  max_files_per_upload: 5,
  enable_perceptual_dedup: true,
  perceptual_dedup_threshold: 5,
  download_cleanup_hours: 1,
  public_base_url: '',
  local_only: false,
  orphan_cleanup_enabled: false,
  orphan_cleanup_days: 30,
  orphan_cleanup_cron: '0 4 * * *'
})

const hasAllImages = computed(() =>
  imageExtensions.every(ext => form.allowed_extensions.includes(ext))
)

const hasAllDocuments = computed(() =>
  documentExtensions.every(ext => form.allowed_extensions.includes(ext))
)

const hasArchives = computed(() =>
  archiveExtensions.every(ext => form.allowed_extensions.includes(ext))
)

function toggleAllImages() {
  if (hasAllImages.value) {
    form.allowed_extensions = form.allowed_extensions.filter(
      ext => !imageExtensions.includes(ext)
    )
  } else {
    form.allowed_extensions = [
      ...new Set([...form.allowed_extensions, ...imageExtensions])
    ]
  }
}

function toggleAllDocuments() {
  if (hasAllDocuments.value) {
    form.allowed_extensions = form.allowed_extensions.filter(
      ext => !documentExtensions.includes(ext)
    )
  } else {
    form.allowed_extensions = [
      ...new Set([...form.allowed_extensions, ...documentExtensions])
    ]
  }
}

function toggleArchives() {
  if (hasArchives.value) {
    form.allowed_extensions = form.allowed_extensions.filter(
      ext => !archiveExtensions.includes(ext)
    )
  } else {
    form.allowed_extensions = [
      ...new Set([...form.allowed_extensions, ...archiveExtensions])
    ]
  }
}

async function loadSettings() {
  pending.value = true
  error.value = ''
  try {
    const settings = await $fetch<{ settings: MediaSettings }>('/api/site/settings/media')
    Object.assign(form, settings.settings)
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('admin.settings.media.loadFailed')
  } finally {
    pending.value = false
  }
}

async function save() {
  saving.value = true

  try {
    await $fetch('/api/admin/settings/media', {
      method: 'PUT',
      body: form
    })
    adminToast.success(t('admin.settings.media.saved'))
  } catch (err) {
    adminToast.error(err, t('admin.settings.common.saveFailed'))
  } finally {
    saving.value = false
  }
}

function resetForm() {
  loadSettings()
}

onMounted(() => {
  loadSettings()
})
</script>
