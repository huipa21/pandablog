import { requireContentManager } from '../../utils/auth'
import { queryDb, useDb } from '../../utils/db'
import { queryRows } from '../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  await requireContentManager(event)
  const db = await useDb()
  const response = await queryDb(db, 'SELECT uploaded_by FROM files;')
  const owners = new Set<string>()

  for (const file of queryRows<Record<string, unknown>>(response)) {
    const name = typeof file.uploaded_by === 'string' ? file.uploaded_by.trim() : ''
    if (name) owners.add(name)
  }

  return {
    owners: Array.from(owners).sort((a, b) => a.localeCompare(b))
  }
})
