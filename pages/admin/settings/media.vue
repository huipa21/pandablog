<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-teal-700">Settings</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-stone-950">Media</h1>
      <p class="mt-2 max-w-2xl text-sm text-stone-600">Configure file upload limits, allowed types, and deduplication.</p>
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
        <!-- File Size Limit -->
        <UFormField label="Maximum file size (MB)" name="max_file_size_mb">
          <UInput
            v-model.number="form.max_file_size_mb"
            type="number"
            min="1"
            max="100"
            icon="i-lucide-hard-drive"
          />
          <template #hint>
            Recommended: 10MB for balanced performance
          </template>
        </UFormField>

        <!-- Max Files Per Upload -->
        <UFormField label="Maximum files per upload" name="max_files_per_upload">
          <UInput
            v-model.number="form.max_files_per_upload"
            type="number"
            min="1"
            max="20"
            icon="i-lucide-files"
          />
          <template #hint>
            Limits concurrent uploads to reduce memory usage
          </template>
        </UFormField>

        <!-- Allowed Extensions -->
        <fieldset class="space-y-3 rounded border border-stone-200 p-4">
          <legend class="text-sm font-medium text-stone-700 mb-3">Allowed file types</legend>

          <!-- Preset groups -->
          <div class="space-y-2 mb-4 pb-4 border-b border-stone-200">
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                :checked="hasAllImages"
                @change="toggleAllImages"
                class="rounded border-stone-300"
              >
              <span>Images (JPEG, PNG, GIF, WebP)</span>
            </label>
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                :checked="hasAllDocuments"
                @change="toggleAllDocuments"
                class="rounded border-stone-300"
              >
              <span>Documents (PDF, Office)</span>
            </label>
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                :checked="hasArchives"
                @change="toggleArchives"
                class="rounded border-stone-300"
              >
              <span>Archives (ZIP)</span>
            </label>
          </div>

          <!-- Individual extensions -->
          <div class="space-y-2">
            <div class="text-xs font-medium text-stone-600 uppercase">Custom selection</div>
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
                  class="rounded border-stone-300"
                >
                <span>.{{ ext.toUpperCase() }}</span>
              </label>
            </div>
          </div>
        </fieldset>

        <!-- Perceptual Deduplication -->
        <fieldset class="space-y-3 rounded border border-stone-200 p-4">
          <legend class="text-sm font-medium text-stone-700">Image deduplication</legend>

          <label class="flex items-center gap-2">
            <input
              v-model="form.enable_perceptual_dedup"
              type="checkbox"
              class="rounded border-stone-300"
            >
            <div>
              <div class="text-sm font-medium text-stone-900">Enable perceptual hashing</div>
              <div class="text-xs text-stone-600">Detect resized/recompressed versions of the same image</div>
            </div>
          </label>

          <template v-if="form.enable_perceptual_dedup">
            <div class="ml-6 space-y-2">
              <label class="text-sm font-medium text-stone-700">Sensitivity threshold</label>
              <div class="flex items-center gap-4">
                <input
                  v-model.number="form.perceptual_dedup_threshold"
                  type="range"
                  min="0"
                  max="20"
                  class="flex-1"
                >
                <span class="text-sm font-medium text-stone-900 w-8">{{ form.perceptual_dedup_threshold }}</span>
              </div>
              <p class="text-xs text-stone-600">
                <template v-if="form.perceptual_dedup_threshold <= 5">Lower values (0-5) = stricter matching</template>
                <template v-else-if="form.perceptual_dedup_threshold <= 10">Medium values (6-10) = balanced matching</template>
                <template v-else>Higher values (11-20) = looser matching</template>
              </p>
            </div>
          </template>
        </fieldset>

        <!-- Actions -->
        <UFormField label="Download file cleanup (hours)" name="download_cleanup_hours">
          <UInput
            v-model.number="form.download_cleanup_hours"
            type="number"
            min="1"
            max="168"
            icon="i-lucide-clock"
          />
          <template #hint>
            Temporary download zip files are deleted after this many hours (1-168)
          </template>
        </UFormField>

        <!-- Save / Cancel -->
        <div class="flex gap-3 pt-4">
          <UButton type="submit" icon="i-lucide-save" :loading="saving">
            Save Settings
          </UButton>
          <UButton type="button" color="neutral" variant="ghost" @click="resetForm">
            Cancel
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
}

definePageMeta({ layout: 'admin' })

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
const saveError = ref('')
const notice = ref('')

const form = reactive<MediaSettings>({
  allowed_extensions: [],
  max_file_size_mb: 10,
  max_files_per_upload: 5,
  enable_perceptual_dedup: true,
  perceptual_dedup_threshold: 5,
  download_cleanup_hours: 1
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
    error.value = err instanceof Error ? err.message : 'Failed to load settings'
  } finally {
    pending.value = false
  }
}

async function save() {
  saving.value = true
  saveError.value = ''
  notice.value = ''

  try {
    await $fetch('/api/admin/settings/media', {
      method: 'PUT',
      body: form
    })
    notice.value = 'Media settings saved successfully'
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Failed to save settings'
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
