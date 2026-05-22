import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/auth'
import { updateMediaSettings, type MediaSettings } from '../../../utils/settings'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const body = await readBody<Partial<MediaSettings>>(event)

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  }

  // Validate and build the settings object
  const settings: MediaSettings = {
    allowed_extensions: Array.isArray(body.allowed_extensions)
      ? body.allowed_extensions.map(e => String(e).toLowerCase()).filter(e => e)
      : [],
    max_file_size_mb: typeof body.max_file_size_mb === 'number' ? Math.max(1, Math.min(100, body.max_file_size_mb)) : 10,
    max_files_per_upload: typeof body.max_files_per_upload === 'number' ? Math.max(1, Math.min(20, body.max_files_per_upload)) : 5,
    enable_perceptual_dedup: body.enable_perceptual_dedup !== false,
    perceptual_dedup_threshold: typeof body.perceptual_dedup_threshold === 'number'
      ? Math.max(0, Math.min(20, body.perceptual_dedup_threshold))
      : 5,
    download_cleanup_hours: typeof body.download_cleanup_hours === 'number'
      ? Math.max(1, Math.min(168, body.download_cleanup_hours))
      : 1
  }

  if (settings.allowed_extensions.length === 0) {
    throw createError({ statusCode: 400, message: 'At least one file extension must be allowed' })
  }

  await updateMediaSettings(settings)

  return { success: true, settings }
})
