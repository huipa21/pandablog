import type { Ref } from 'vue'

interface MediaSettings {
  allowed_extensions: string[]
  max_file_size_mb: number
  max_files_per_upload: number
  enable_perceptual_dedup: boolean
  perceptual_dedup_threshold: number
}

/**
 * Client-side media configuration for validation and UI
 */
export function useMediaConfig() {
  const settings = ref<MediaSettings | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  onMounted(async () => {
    try {
      loading.value = true
      const response = await $fetch<{ settings: MediaSettings }>('/api/site/settings/media')
      settings.value = response.settings
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load media settings'
      // Provide defaults if fetch fails
      settings.value = {
        allowed_extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip'],
        max_file_size_mb: 10,
        max_files_per_upload: 5,
        enable_perceptual_dedup: true,
        perceptual_dedup_threshold: 5
      }
    } finally {
      loading.value = false
    }
  })

  /**
   * Check if a file extension is allowed
   */
  function isExtensionAllowed(extension: string): boolean {
    if (!settings.value) return false
    return settings.value.allowed_extensions.includes(extension.toLowerCase())
  }

  /**
   * Check if a file size is within limits (in bytes)
   */
  function isFileSizeValid(bytes: number): boolean {
    if (!settings.value) return false
    return bytes <= settings.value.max_file_size_mb * 1024 * 1024
  }

  /**
   * Get max file size in bytes
   */
  function getMaxFileSizeBytes(): number {
    return (settings.value?.max_file_size_mb ?? 10) * 1024 * 1024
  }

  /**
   * Get max file size formatted for display
   */
  function getMaxFileSizeDisplay(): string {
    const mb = settings.value?.max_file_size_mb ?? 10
    return `${mb}MB`
  }

  /**
   * Get max files per upload
   */
  function getMaxFilesPerUpload(): number {
    return settings.value?.max_files_per_upload ?? 5
  }

  /**
   * Get list of allowed extensions
   */
  function getAllowedExtensions(): string[] {
    return settings.value?.allowed_extensions ?? []
  }

  /**
   * Validate a file before upload
   */
  function validateFileBeforeUpload(file: File): { valid: true } | { valid: false; reason: string } {
    if (!settings.value) {
      return { valid: false, reason: 'Settings not loaded' }
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || ''

    if (!extension) {
      return { valid: false, reason: 'File has no extension' }
    }

    if (!isExtensionAllowed(extension)) {
      return { valid: false, reason: `Extension .${extension} is not allowed` }
    }

    if (!isFileSizeValid(file.size)) {
      return { valid: false, reason: `File exceeds ${settings.value.max_file_size_mb}MB limit` }
    }

    return { valid: true }
  }

  return {
    settings: computed(() => settings.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    isExtensionAllowed,
    isFileSizeValid,
    getMaxFileSizeBytes,
    getMaxFileSizeDisplay,
    getMaxFilesPerUpload,
    getAllowedExtensions,
    validateFileBeforeUpload
  }
}
