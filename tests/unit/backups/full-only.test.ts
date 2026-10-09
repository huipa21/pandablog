import { describe, expect, it } from 'vitest'
import { createBackupSchema, supportedFull } from '../../../server/utils/backups/contracts'
import { normalizeBackupRecord } from '../../../server/utils/backups/registry'

describe('full-only backup admission and conservative legacy classification', () => {
  it.each([{}, {note: null}, {type: 'full', note: 'portable'}])('accepts the full-only create contract %j', body => {
    expect(createBackupSchema.safeParse(body).success).toBe(true)
  })
  it.each([{type: 'incremental'}, {type: 'partial'}, {parent: null}, {tables: []}, {unknown: true}, {note: 'x'.repeat(501)}])('rejects retired/unknown create input %j', body => {
    expect(createBackupSchema.safeParse(body).success).toBe(false)
  })
  it.each([undefined, 'future', 'incremental', 'partial'])('never upgrades legacy type %s to full', type => {
    const record = normalizeBackupRecord({id: 'legacy', type, status: 'ready'})
    expect(record.type).not.toBe('full')
    expect(supportedFull(record)).toBe(false)
  })
  it.each([{parent: 'base'}, {chain_root: 'base'}, {included_tables: []}, {parent: ''}, {chain_root: 0}, {format_version: 2}, {format_version: '1'}])('rejects contradictory/unsupported full metadata %j', extra => {
    expect(supportedFull(normalizeBackupRecord({id: 'legacy', type: 'full', ...extra}))).toBe(false)
  })
  it('accepts a standalone legacy full without inventing bundle metadata', () => {
    const record = normalizeBackupRecord({id: 'legacy', type: 'full'})
    expect(supportedFull(record)).toBe(true)
    expect(record.bundle_size_bytes).toBeUndefined()
  })
  it('retains bundle metadata during normalization', () => {
    expect(normalizeBackupRecord({id: 'new', type: 'full', format_version: 1, bundle_filename: 'backup.tar.gz', bundle_size_bytes: 123, bundle_sha256: 'a'.repeat(64)})).toMatchObject({format_version: 1, bundle_filename: 'backup.tar.gz', bundle_size_bytes: 123, bundle_sha256: 'a'.repeat(64)})
  })
})
