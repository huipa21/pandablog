import { requireAdminUser } from '../../utils/auth'
import { queryDb, useDb } from '../../utils/db'
import { mediaDeleteStoredObjects } from '../../utils/fileStorage'
import { mediaNormalizeHash, mediaNormalizeFolderId, mediaNormalizeFileRecord } from '../../utils/mediaLibrary'
import { firstRow, stringifyRecordId } from '../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const body = await readBody<{
    action: 'delete' | 'update'
    hashes: string[]
    data?: { tags?: string[]; comment?: string; folders?: string[]; folderMode?: 'replace' | 'add' }
  }>(event)

  if (!body.action || !Array.isArray(body.hashes) || !body.hashes.length) {
    throw createError({ statusCode: 400, message: 'action and hashes[] are required' })
  }

  if (body.hashes.length > 200) {
    throw createError({ statusCode: 400, message: 'Maximum 200 files per bulk operation' })
  }

  const db = await useDb()
  const hashes = body.hashes.map((h) => mediaNormalizeHash(h)).filter(Boolean)
  let success = 0
  let failed = 0

  if (body.action === 'delete') {
    for (const hash of hashes) {
      try {
        // Fetch file record to get storage paths before deletion
        const response = await queryDb(db, 'SELECT * FROM type::record($table, $id) LIMIT 1;', { table: 'files', id: hash })
        const record = firstRow<Record<string, unknown>>(response)
        if (record) {
          const file = mediaNormalizeFileRecord(record)
          await mediaDeleteStoredObjects(file)
        }
        await queryDb(db, 'DELETE type::record($table, $id);', { table: 'files', id: hash })
        success++
      } catch {
        failed++
      }
    }
  } else if (body.action === 'update') {
    const data = body.data
    if (!data) throw createError({ statusCode: 400, message: 'data is required for update action' })

    for (const hash of hashes) {
      try {
        const assignments: string[] = ['updated_at = time::now()']
        const params: Record<string, unknown> = { table: 'files', id: hash }

        if (data.tags !== undefined) {
          const tags = Array.isArray(data.tags)
            ? [...new Set(data.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean).map((t) => t.slice(0, 80)))]
            : []
          params.tags = tags
          assignments.push('tags = $tags')
        }

        if (data.comment !== undefined) {
          const comment = typeof data.comment === 'string' ? data.comment.trim().slice(0, 2000) : ''
          if (comment) {
            params.comment = comment
            assignments.push('comment = $comment')
          } else {
            assignments.push('comment = NONE')
          }
        }

        if (data.folders !== undefined) {
          let folderIds = Array.isArray(data.folders)
            ? [...new Set(data.folders.filter((f): f is string => typeof f === 'string').map((f) => mediaNormalizeFolderId(f)))]
            : []

          if (data.folderMode === 'add' && folderIds.length) {
            const existingResponse = await queryDb(db, 'SELECT folders FROM type::record($table, $id) LIMIT 1;', { table: 'files', id: hash })
            const existing = firstRow<Record<string, unknown>>(existingResponse)
            folderIds = Array.from(new Set([...normalizeExistingFolderIds(existing?.folders), ...folderIds]))
          }

          const folderExpressions = folderIds.map((folderId, index) => {
            params[`folder_id_${index}`] = folderId
            return `type::record($folder_table, $folder_id_${index})`
          })
          params.folder_table = 'folder'
          assignments.push(`folders = [${folderExpressions.join(', ')}]`)
        }

        await queryDb(db, `UPDATE type::record($table, $id) SET ${assignments.join(', ')};`, params)
        success++
      } catch {
        failed++
      }
    }
  } else {
    throw createError({ statusCode: 400, message: 'Invalid action. Use "delete" or "update".' })
  }

  return { success, failed }
})

function normalizeExistingFolderIds(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((folder) => mediaNormalizeFolderId(stringifyRecordId(folder))).filter(Boolean)
}
