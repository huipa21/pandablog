import type { BackupRecord } from './config'
import { getBackup, updateBackupRecord } from './registry'
import { supportedFull } from './contracts'

type ReadyFields = Parameters<typeof updateBackupRecord>[1] & {status: 'ready'}
/** Reconcile only this worker's exact generation after a missing/lost response.
 * Never infer ready from file existence, rewrite a successor, or delete an
 * ambiguous target. A failed confirmation leaves row/artifacts for inspection. */
export async function publishReadyBackup(id: string, fields: ReadyFields): Promise<BackupRecord> {
  try {
    const record = await updateBackupRecord(id, fields)
    if (!record) throw new Error('Backup ready publication was not acknowledged')
    return record
  } catch (error) {
    const current = await getBackup(id).catch(() => null)
    if (current?.status === 'ready' && supportedFull(current) && Object.entries(fields).every(([key, value]) => JSON.stringify(current[key as keyof BackupRecord]) === JSON.stringify(value))) return current
    throw error
  }
}
