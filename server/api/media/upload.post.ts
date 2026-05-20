import { requireAdminUser } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { mediaCreateOrReuseFileRecord } from '../../utils/mediaLibrary'
import { getMediaSettings } from '../../utils/settings'
import type { UploadFileResult } from '~/types/content'

export default defineEventHandler(async (event) => {
  const user = await requireAdminUser(event)
  const settings = await getMediaSettings()
  const db = await useDb()
  const form = await readMultipartFormData(event)

  if (!form?.length) {
    throw createError({ statusCode: 400, message: 'No files provided' })
  }

  const files = form.filter((field) => field.filename && field.data?.length)

  if (!files.length) {
    throw createError({ statusCode: 400, message: 'No files provided' })
  }

  if (files.length > settings.max_files_per_upload) {
    throw createError({
      statusCode: 400,
      message: `Maximum ${settings.max_files_per_upload} files per upload allowed`
    })
  }

  const results: UploadFileResult[] = []

  for (const file of files) {
    try {
      results.push(await mediaCreateOrReuseFileRecord(db, {
        originalName: file.filename || 'upload',
        data: file.data,
        mimeType: file.type,
        uploadedBy: user.username
      }, settings))
    } catch (error) {
      results.push({
        original_name: file.filename || 'upload',
        status: 'rejected',
        reason: error instanceof Error ? error.message : 'Upload failed'
      })
    }
  }

  return { results }
})
