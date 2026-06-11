import { requireSuperadmin } from '../../../utils/auth'
import { importExternalBackup } from '../../../utils/backups/importExternal'

const MAX_DB_SIZE = 512 * 1024 * 1024 // 512 MB
const MAX_MEDIA_SIZE = 4 * 1024 * 1024 * 1024 // 4 GB

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)

  const form = await readMultipartFormData(event)
  if (!form?.length) {
    throw createError({ statusCode: 400, message: 'No files provided' })
  }

  const dbFile = form.find((f) => f.name === 'db' && f.data?.length)
  const mediaFile = form.find((f) => f.name === 'media' && f.data?.length)
  const manifestFile = form.find((f) => f.name === 'manifest')

  if (!dbFile) {
    throw createError({ statusCode: 400, message: 'Missing db file (field name: db)' })
  }
  if (!mediaFile) {
    throw createError({ statusCode: 400, message: 'Missing media file (field name: media)' })
  }

  if (dbFile.data.length > MAX_DB_SIZE) {
    throw createError({ statusCode: 413, message: 'db.surql.gz exceeds the 512 MB limit' })
  }
  if (mediaFile.data.length > MAX_MEDIA_SIZE) {
    throw createError({ statusCode: 413, message: 'media.tar.gz exceeds the 4 GB limit' })
  }

  const id = await importExternalBackup({
    dbGzBuffer: dbFile.data,
    mediaTarGzBuffer: mediaFile.data,
    manifestBuffer: manifestFile?.data ?? null,
  })

  setResponseStatus(event, 201)
  return { ok: true, id }
})
