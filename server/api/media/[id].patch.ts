import { requireAdminUser } from '../../utils/auth'
import { queryDb, useDb } from '../../utils/db'
import { mediaNormalizeFileRecord, mediaNormalizeFolderId, mediaNormalizeHash } from '../../utils/mediaLibrary'
import { firstRow } from '../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const id = mediaNormalizeHash(getRouterParam(event, 'id') ?? '')
  const body = await readBody<Record<string, unknown>>(event)
  const db = await useDb()
  const assignments: string[] = ['updated_at = time::now()']
  const params: Record<string, unknown> = {
    table: 'files',
    id
  }

  if (Object.prototype.hasOwnProperty.call(body, 'original_name')) {
    const name = typeof body.original_name === 'string' ? body.original_name.trim() : ''
    if (name) {
      params.original_name = name.slice(0, 255)
      assignments.push('original_name = $original_name')
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'comment')) {
    const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
    assignments.push(comment ? 'comment = $comment' : 'comment = NONE')
    if (comment) {
      params.comment = comment.slice(0, 2000)
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'tags')) {
    const tags = normalizeTags(body.tags)
    params.tags = tags
    assignments.push('tags = $tags')
  }

  if (Object.prototype.hasOwnProperty.call(body, 'folders')) {
    const folderIds = normalizeFolderIds(body.folders)
    const folderExpressions = folderIds.map((folderId, index) => {
      params[`folder_id_${index}`] = folderId
      return `type::record($folder_table, $folder_id_${index})`
    })
    params.folder_table = 'folder'
    assignments.push(`folders = [${folderExpressions.join(', ')}]`)
  }

  const response = await queryDb(
    db,
    `UPDATE type::record($table, $id) SET ${assignments.join(', ')} RETURN AFTER;`,
    params
  )
  const record = firstRow<Record<string, unknown>>(response)

  if (!record) {
    throw createError({ statusCode: 404, message: 'Media file not found' })
  }

  return mediaNormalizeFileRecord(record)
})

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.slice(0, 80))
  ))
}

function normalizeFolderIds(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => mediaNormalizeFolderId(item))
  ))
}
