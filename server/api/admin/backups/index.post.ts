import { z } from 'zod'
import { requireSuperadmin } from '../../../utils/auth'
import { startBackupJob } from '../../../utils/backups/create'

const bodySchema = z.object({
  type: z.enum(['full', 'incremental', 'partial']),
  note: z.string().max(500).optional().nullable(),
  parent: z.string().optional().nullable(),
  tables: z.array(z.string().min(1)).optional().nullable(),
})

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  const body = await readBody<unknown>(event)
  const parsed = bodySchema.safeParse(body)

  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? 'Invalid request body' })
  }

  const { type, note, parent, tables } = parsed.data

  // startBackupJob acquires the mutex, creates the DB record (synchronous portion),
  // fires the heavy work in background, and returns the new id immediately.
  const id = await startBackupJob({ type, note: note ?? null, parent: parent ?? null, tables: tables ?? null })

  setResponseStatus(event, 202)
  return { ok: true, id, message: 'Backup started. Poll /api/admin/backups/status for progress.' }
})
