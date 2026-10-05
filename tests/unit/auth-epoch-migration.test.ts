import { describe, expect, it, vi } from 'vitest'
import { ensureAuthEpochs } from '../../server/utils/auth-epoch-migration'
const query = vi.hoisted(() => vi.fn())
vi.mock('../../server/utils/db', () => ({queryDb: query}))
vi.mock('../../server/utils/users', () => ({newAuthEpoch: () => 'a'.repeat(48)}))

describe('auth migration finite refusal', () => {
  it('refuses malformed result rows instead of unbounded writes', async () => {
    query.mockResolvedValue([[{value: true}]])
    await expect(ensureAuthEpochs({} as never)).rejects.toThrow('Invalid auth migration record')
    expect(query).toHaveBeenCalledTimes(1)
  })
  it('refuses a page which never makes progress, retaining a finite prior-page identity', async () => {
    query.mockClear().mockImplementation(async (_db, sql: string) => sql.startsWith('SELECT') ? [[{id: 'users:fixture'}]] : [[]])
    await expect(ensureAuthEpochs({} as never)).rejects.toThrow(/no progress/)
    expect(query).toHaveBeenCalledTimes(3)
  })
})
