import { describe, it, expect, vi, beforeAll } from 'vitest'

beforeAll(() => {
  vi.stubGlobal('createError', (options: { statusCode: number, message: string }) => {
    const err = new Error(options.message) as Error & { statusCode?: number }
    err.statusCode = options.statusCode
    return err
  })
})

const { validateDumpStructure } = await import('../../../server/utils/backups/validate')

describe('validateDumpStructure', () => {
  const validDump = [
    '-- ------------------------------',
    'OPTION IMPORT;',
    '',
    'DEFINE TABLE post TYPE NORMAL SCHEMALESS PERMISSIONS NONE;',
    "INSERT [ { id: post:abc, title: 'Hello' } ];",
    '',
  ].join('\n')

  it('accepts a well-formed export dump', () => {
    expect(() => validateDumpStructure(validDump)).not.toThrow()
  })

  it('rejects an empty dump', () => {
    expect(() => validateDumpStructure('   ')).toThrow(/empty/i)
  })

  it('rejects a dump missing OPTION IMPORT', () => {
    const bad = 'DEFINE TABLE post SCHEMALESS;\nINSERT [];'
    expect(() => validateDumpStructure(bad)).toThrow(/OPTION IMPORT/i)
  })

  it('rejects a dump with no DEFINE/INSERT/CREATE statements', () => {
    const bad = 'OPTION IMPORT;\n-- nothing else here'
    expect(() => validateDumpStructure(bad)).toThrow(/DEFINE\/INSERT\/CREATE/i)
  })
})
