import { backupIdPart } from './registry'
import { BACKUP_LIMITS } from './streams'
import type { BackupRecord } from './config'

/** Missing parents, aliases, cycles and excess depth are fatal before cutover. */
export function resolveBackupChain(id: string, records: BackupRecord[]): BackupRecord[] {
  const byId = new Map(records.map(record => [backupIdPart(record.id), record]))
  const visited = new Set<string>(), chain: BackupRecord[] = []
  let cursor: string | null = backupIdPart(id)
  while (cursor) {
    if (visited.has(cursor) || chain.length >= BACKUP_LIMITS.chainDepth) throw new Error('Backup ancestry cycle or depth limit')
    visited.add(cursor)
    const record = byId.get(cursor)
    if (!record || record.status !== 'ready' && backupIdPart(record.id) !== backupIdPart(id)) throw new Error('Backup parent is missing or not ready')
    chain.unshift(record)
    cursor = record.parent ? backupIdPart(record.parent) : null
  }
  if (chain[0]?.type !== 'full') throw new Error('Backup chain has no full base')
  return chain
}
