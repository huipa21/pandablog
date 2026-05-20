/**
 * Validate file uploads against media settings
 */
import type { MediaSettings } from './settings'

/**
 * Check if extension is allowed
 */
export function isExtensionAllowed(extension: string, settings: MediaSettings): boolean {
  return settings.allowed_extensions.includes(extension.toLowerCase())
}

/**
 * Check if file size is within limit
 */
export function isFileSizeValid(sizeBytes: number, settings: MediaSettings): boolean {
  const maxBytes = settings.max_file_size_mb * 1024 * 1024
  return sizeBytes <= maxBytes
}

/**
 * Get MIME type from extension (allowlist-based for security)
 */
const MIME_TYPES: Record<string, string> = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'pdf': 'application/pdf',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ppt': 'application/vnd.ms-powerpoint',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'txt': 'text/plain',
  'md': 'text/markdown',
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'mov': 'video/quicktime',
  'zip': 'application/zip',
  'rar': 'application/vnd.rar',
  '7z': 'application/x-7z-compressed'
}

export function getExpectedMimeType(extension: string): string | null {
  return MIME_TYPES[extension.toLowerCase()] || null
}

/**
 * Validate that reported MIME type matches extension
 */
export function isMimeTypeValid(mimeType: string, extension: string): boolean {
  const expected = getExpectedMimeType(extension)
  if (!expected) return false
  
  // Allow some flexibility for MIME types (e.g., image/* for various formats)
  if (mimeType === expected) return true
  
  // JPEG can be reported as 'image/jpg' or 'image/jpeg'
  if (extension.toLowerCase() === 'jpg' && mimeType === 'image/jpg') return true
  if (extension.toLowerCase() === 'jpeg' && mimeType === 'image/jpg') return true
  if (extension.toLowerCase() === 'md' && mimeType === 'text/plain') return true
  if (extension.toLowerCase() === 'zip' && mimeType === 'application/x-zip-compressed') return true
  if (extension.toLowerCase() === 'rar' && mimeType === 'application/octet-stream') return true
  if (extension.toLowerCase() === '7z' && mimeType === 'application/octet-stream') return true
  
  return false
}

/**
 * Extract extension from filename
 */
export function getExtension(filename: string): string {
  const parts = filename.split('.')
  return (parts.length > 1 ? parts[parts.length - 1] : '') || ''
}

/**
 * Validate a single file upload
 */
export function validateUpload(
  filename: string,
  sizeBytes: number,
  mimeType: string,
  settings: MediaSettings
): { valid: true } | { valid: false; reason: string } {
  const extension = getExtension(filename)

  if (!extension) {
    return { valid: false, reason: 'File has no extension' }
  }

  if (!isExtensionAllowed(extension, settings)) {
    return { valid: false, reason: `Extension .${extension} is not allowed` }
  }

  if (!isFileSizeValid(sizeBytes, settings)) {
    return { valid: false, reason: `File exceeds maximum size of ${settings.max_file_size_mb}MB` }
  }

  if (!isMimeTypeValid(mimeType, extension)) {
    return { valid: false, reason: `MIME type ${mimeType} does not match extension .${extension}` }
  }

  return { valid: true }
}
