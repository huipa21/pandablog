import { recordActivity } from '../../../../utils/activity'
import { requireUser } from '../../../../utils/auth'
import { disableUserMfa, getUserMfaState, setUserBackupCodes } from '../../../../utils/mfa/store'
import { decryptMfaSecret } from '../../../../utils/mfa/secret-crypto'
import { matchBackupCode, verifyTotpToken } from '../../../../utils/mfa/totp'
import { findUserById, verifyUserPassword } from '../../../../utils/users'

// Disable MFA for the current user. Requires re-entering the account password
// AND a current authenticator code (or an unused backup code) so a hijacked
// session alone cannot turn off the second factor.
export default defineEventHandler(async (event) => {
  const sessionUser = await requireUser(event)
  const body = await readBody<{ password?: string, code?: string }>(event)
  const password = String(body?.password ?? '')
  const code = String(body?.code ?? '').trim()

  const state = await getUserMfaState(sessionUser.id)
  if (!state?.enabled) {
    throw createError({ statusCode: 409, message: 'Multi-factor authentication is not enabled' })
  }

  const account = await findUserById(sessionUser.id)
  if (!account || !await verifyUserPassword(account, password)) {
    throw createError({ statusCode: 401, message: 'Incorrect password' })
  }

  const secret = state.secret ? decryptMfaSecret(state.secret) : ''
  const totpOk = secret ? await verifyTotpToken(secret, code) : false

  if (!totpOk) {
    const backupIndex = await matchBackupCode(state.backupCodes, code)
    if (backupIndex < 0) {
      throw createError({ statusCode: 400, message: 'Invalid verification code' })
    }
    // Consume the backup code that was just used to authorize the change.
    const remaining = state.backupCodes.filter((_, index) => index !== backupIndex)
    await setUserBackupCodes(sessionUser.id, remaining)
  }

  await disableUserMfa(sessionUser.id)

  recordActivity(event, {
    action: 'auth.mfa.disabled',
    resource_type: 'session',
    resource_id: sessionUser.id,
    metadata: { username: sessionUser.username },
    description: 'Multi-factor authentication disabled'
  })

  return { enabled: false }
})
