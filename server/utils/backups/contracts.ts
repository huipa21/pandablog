import { z } from 'zod'
import type { BackupRecord } from './config'

export const createBackupSchema = z.object({
  type: z.literal('full').optional(),
  note: z.string().max(500).nullable().optional(),
}).strict()

/** A full assertion cannot be manufactured by dropping legacy indicators. */
export function supportedFull(record: Pick<BackupRecord, 'type' | 'parent' | 'chain_root' | 'included_tables' | 'format_version' | 'bundle_filename' | 'bundle_size_bytes' | 'bundle_sha256'>): boolean {
  const bundled = record.bundle_filename !== undefined || record.bundle_size_bytes !== undefined || record.bundle_sha256 !== undefined || record.format_version !== undefined
  return record.type === 'full' && record.parent == null && record.chain_root == null && record.included_tables == null && (!bundled || (record.format_version === 1 && record.bundle_filename === 'backup.tar.gz' && Number.isSafeInteger(record.bundle_size_bytes) && record.bundle_size_bytes! > 0 && /^[a-f0-9]{64}$/.test(record.bundle_sha256 ?? '')))
}
export function assertSupportedFull(record: Parameters<typeof supportedFull>[0]): void {
  if (!supportedFull(record)) throw new Error('Unsupported legacy backup; recover on an approved isolated copy with a compatible release')
}
