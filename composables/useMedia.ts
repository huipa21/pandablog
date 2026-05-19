import type { MediaRecord, UploadFileResult } from '~/types/content'

interface MediaListResponse {
  files: MediaRecord[]
  total: number
  page: number
  limit: number
  pages: number
}

interface UploadResponse {
  results: UploadFileResult[]
}

export function useMedia() {
  /**
   * List media files with pagination and filters
   */
  async function listMedia(options: {
    page?: number
    limit?: number
    search?: string
    type?: 'all' | 'image' | 'document' | 'archive'
  } = {}) {
    const page = options.page || 1
    const limit = options.limit || 20
    const search = options.search || ''
    const type = options.type || 'all'

    const query = new URLSearchParams()
    query.set('page', String(page))
    query.set('limit', String(limit))
    if (search) query.set('search', search)
    if (type !== 'all') query.set('type', type)

    return await $fetch<MediaListResponse>(`/api/media?${query}`)
  }

  /**
   * Upload multiple files
   */
  async function uploadFiles(files: File[], onProgress?: (file: File, progress: number) => void) {
    const formData = new FormData()
    for (const file of files) {
      formData.append('files', file)
    }

    return await $fetch<UploadResponse>('/api/media/upload', {
      method: 'POST',
      body: formData,
      onRequest({ request }) {
        // Track upload progress if needed
        if (request instanceof XMLHttpRequest) {
          request.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable && onProgress && files[0]) {
              const progress = (event.loaded / event.total) * 100
              onProgress(files[0], progress)
            }
          })
        }
      }
    })
  }

  /**
   * Delete a media file
   */
  async function deleteMedia(id: string) {
    return await $fetch(`/api/media/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
  }

  /**
   * Get public file URL
   */
  function getFileUrl(id: string): string {
    return `/api/media/file/${encodeURIComponent(id)}`
  }

  /**
   * Format file size for display
   */
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  /**
   * Get file type category
   */
  function getFileType(extension: string): 'image' | 'document' | 'archive' | 'other' {
    const ext = extension.toLowerCase()
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'document'
    if (['zip'].includes(ext)) return 'archive'
    return 'other'
  }

  /**
   * Get icon name for file type
   */
  function getFileIcon(extension: string): string {
    const type = getFileType(extension)
    const iconMap: Record<string, string> = {
      'image': 'i-lucide-image',
      'document': 'i-lucide-file-text',
      'archive': 'i-lucide-archive',
      'other': 'i-lucide-file'
    }
    return iconMap[type] || 'i-lucide-file'
  }

  return {
    listMedia,
    uploadFiles,
    deleteMedia,
    getFileUrl,
    formatFileSize,
    getFileType,
    getFileIcon
  }
}
