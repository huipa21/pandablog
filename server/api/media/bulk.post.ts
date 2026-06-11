import { requireContentManager } from '../../utils/auth'
import { queryDb, useDb } from '../../utils/db'
import { mediaDeleteStoredObjects } from '../../utils/fileStorage'
import { mediaNormalizeHash, mediaNormalizeFolderId, mediaNormalizeFileRecord } from '../../utils/mediaLibrary'
import { queryRows, stringifyRecordId } from '../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  await requireContentManager(event)
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
    const response = await queryDb(
      db,
      `SELECT id, hash, original_path, variants
       FROM files
       WHERE hash IN $hashes;`,
      { hashes }
    )
    const filesByHash = new Map(queryRows<Record<string, unknown>>(response).map((record) => {
      const file = mediaNormalizeFileRecord(record)
      return [file.hash, file]
    }))
    const deleteHashes: string[] = []

    for (const hash of hashes) {
      try {
        const file = filesByHash.get(hash)
        if (file) {
          await mediaDeleteStoredObjects(file)
        }
        deleteHashes.push(hash)
        success++
      } catch {
        failed++
      }
    }

    if (deleteHashes.length) {
      await queryDb(db, 'DELETE files WHERE hash IN $hashes;', { hashes: deleteHashes })
    }
  } else if (body.action === 'update') {
    const data = body.data
    if (!data) throw createError({ statusCode: 400, message: 'data is required for update action' })

    const assignments: string[] = ['updated_at = time::now()']
    const params: Record<string, unknown> = { hashes }

    if (data.tags !== undefined) {
      params.tags = normalizeBulkTags(data.tags)
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
      const folderIds = normalizeBulkFolderIds(data.folders)

      if (data.folderMode === 'add' && folderIds.length) {
        const existingResponse = await queryDb(db, 'SELECT id, hash, folders FROM files WHERE hash IN $hashes;', { hashes })
        const existingFoldersByHash = new Map(queryRows<Record<string, unknown>>(existingResponse).map((record) => [
          String(record.hash ?? recordIdPartFromFileId(record.id)),
          normalizeExistingFolderIds(record.folders)
        ]))

        for (const hash of hashes) {
          try {
            const perFileAssignments = [...assignments]
            const perFileParams: Record<string, unknown> = { ...params, table: 'files', id: hash }
            addFolderAssignment(
              perFileAssignments,
              perFileParams,
              Array.from(new Set([...(existingFoldersByHash.get(hash) ?? []), ...folderIds]))
            )
            await queryDb(db, `UPDATE type::record($table, $id) SET ${perFileAssignments.join(', ')};`, perFileParams)
            success++
          } catch {
            failed++
          }
        }
      } else {
        addFolderAssignment(assignments, params, folderIds)
        try {
          if (hashes.length) {
            await queryDb(db, `UPDATE files SET ${assignments.join(', ')} WHERE hash IN $hashes;`, params)
          }
          success += hashes.length
        } catch {
          failed += hashes.length
        }
      }
    } else {
      try {
        if (hashes.length) {
          await queryDb(db, `UPDATE files SET ${assignments.join(', ')} WHERE hash IN $hashes;`, params)
        }
        success += hashes.length
      } catch {
        failed += hashes.length
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

function normalizeBulkTags(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(
    value
      .filter((tag): tag is string => typeof tag === 'string')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => tag.slice(0, 80))
  ))
}

function normalizeBulkFolderIds(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(
    value
      .filter((folder): folder is string => typeof folder === 'string')
      .map((folder) => mediaNormalizeFolderId(folder))
      .filter(Boolean)
  ))
}

function addFolderAssignment(assignments: string[], params: Record<string, unknown>, folderIds: string[]) {
  const folderExpressions = folderIds.map((folderId, index) => {
    params[`folder_id_${index}`] = folderId
    return `type::record($folder_table, $folder_id_${index})`
  })
  params.folder_table = 'folder'
  assignments.push(`folders = [${folderExpressions.join(', ')}]`)
}

function recordIdPartFromFileId(value: unknown) {
  const id = stringifyRecordId(value)
  return id.startsWith('files:') ? id.slice('files:'.length) : id
}
