import { createError, type H3Event } from 'h3'
import { findUserById, verifyUserPassword } from '../users'
import { requestAbortSignal } from '../request-abort'

const RECENT_MS = 5 * 60_000
/** Profile refresh timestamps are NOT credential proof. Only sealed secure
 * authenticatedAt from login/MFA/setup or a rechecked current password counts.
 */
export async function requireRecentAuthentication(event: H3Event, userId: string, epoch: string, password?: unknown): Promise<void> {
  const session = await getUserSession(event)
  const secure = session.secure as {authEpoch?: unknown, authenticatedAt?: unknown} | undefined
  if (secure?.authEpoch !== epoch) throw createError({statusCode: 403, message: 'Recent authentication is required', data: {code: 'RECENT_AUTH_REQUIRED'}})
  const at = secure.authenticatedAt
  const timestamp = typeof at === 'string' && at.length <= 64 ? Date.parse(at) : NaN
  if (Number.isFinite(timestamp) && timestamp <= Date.now() && Date.now() - timestamp <= RECENT_MS) return
  if (typeof password === 'string' && password.length <= 200) {
    const account = await findUserById(userId)
    if (account?.active && account.auth_epoch === epoch && await verifyUserPassword(account, password, requestAbortSignal(event))) return
  }
  throw createError({statusCode: 403, message: 'Recent authentication or current password is required', data: {code: 'RECENT_AUTH_REQUIRED'}})
}
