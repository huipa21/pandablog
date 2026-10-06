import { createError } from 'h3'
import { containsEmoji } from '../../utils/slug'
import { mediaNormalizeFolderId } from './mediaLibrary'

function strings(value: unknown) {
  if (!Array.isArray(value) || value.length > 32 || value.some(item => typeof item !== 'string')) throw createError({statusCode: 400, message: 'Media tags/folders must contain at most 32 strings'})
  return value as string[]
}
export function mediaMetadataTags(value: unknown) {
  return [...new Set(strings(value).map(tag => tag.trim().slice(0, 80)).filter(tag => tag && !containsEmoji(tag)))]
}
export function mediaMetadataFolders(value: unknown) {
  return [...new Set(strings(value).map(mediaNormalizeFolderId))]
}
