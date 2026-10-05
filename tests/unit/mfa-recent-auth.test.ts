import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requireRecentAuthentication } from '../../server/utils/mfa/recent-auth'

const state = vi.hoisted(() => ({epoch: 'a'.repeat(48), verify: vi.fn(async () => true)}))
vi.mock('../../server/utils/users', () => ({findUserById: async () => ({active: true, auth_epoch: state.epoch}), verifyUserPassword: state.verify}))
afterEach(() => vi.unstubAllGlobals())
const event = () => ({context: {}, node: {req: Object.assign(new EventEmitter(), {aborted: false}), res: Object.assign(new EventEmitter(), {destroyed: false, writableEnded: false})}} as never)

describe('MFA recent authentication proof', () => {
  it('profile/display timestamps cannot refresh proof; future/old proof needs current password and original epoch', async () => {
    const epoch = 'a'.repeat(48), now = Date.now()
    state.epoch = epoch
    vi.stubGlobal('getUserSession', async () => ({loggedInAt: new Date(now).toISOString(), secure: {authEpoch: epoch, authenticatedAt: new Date(now - 10 * 60_000).toISOString()}}))
    await expect(requireRecentAuthentication(event(), 'users:fixture', epoch)).rejects.toMatchObject({statusCode: 403})
    await expect(requireRecentAuthentication(event(), 'users:fixture', epoch, 'fixture-password')).resolves.toBeUndefined()
    state.epoch = 'b'.repeat(48)
    await expect(requireRecentAuthentication(event(), 'users:fixture', epoch, 'fixture-password')).rejects.toMatchObject({statusCode: 403})
    vi.stubGlobal('getUserSession', async () => ({secure: {authEpoch: epoch, authenticatedAt: new Date(now + 60_000).toISOString()}}))
    await expect(requireRecentAuthentication(event(), 'users:fixture', epoch)).rejects.toMatchObject({statusCode: 403})
    vi.stubGlobal('getUserSession', async () => ({secure: {authEpoch: epoch, authenticatedAt: new Date(now).toISOString()}}))
    await expect(requireRecentAuthentication(event(), 'users:fixture', epoch)).resolves.toBeUndefined()
  })
})
