import { requireAdminUser } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { mediaCreateOrReuseFileRecord } from '../../utils/mediaLibrary'
import { getMediaSettings } from '../../utils/settings'

export default defineEventHandler(async (event) => {
  const user = await requireAdminUser(event)
  const formData = await readMultipartFormData(event)
  const file = formData?.find((item) => item.filename && item.data?.length)

  if (!file) {
    throw createError({ statusCode: 400, message: 'File is required' })
  }

  const db = await useDb()
  const settings = await getMediaSettings()
  const result = await mediaCreateOrReuseFileRecord(db, {
    originalName: file.filename || 'upload',
    data: file.data,
    mimeType: file.type,
    uploadedBy: user.username
  }, settings)
  const record = result.record ?? result.similar_to

  if (!record) {
    throw createError({ statusCode: 400, message: result.reason || 'Upload failed' })
  }

  return record
})
