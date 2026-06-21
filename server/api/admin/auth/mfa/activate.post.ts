import { recordActivity } from '../../../../utils/activity'
import { alertDetailsFromEvent, dispatchSecurityAlert } from '../../../../utils/notify/security-alert'
import { clearMfaEnroll, getMfaEnrollSecret, resolveMfaActor } from '../../../../utils/mfa/session'
import { enableUserMfa, getUserMfaState } from '../../../../utils/mfa/store'
import { encryptMfaSecret } from '../../../../utils/mfa/secret-crypto'
import { generateBackupCodes, verifyTotpToken } from '../../../../utils/mfa/totp'
import { findUserById, toSessionUser, touchUserLogin } from '../../../../utils/users'

// Confirm enrollment: verify a code from the pending secret, then persist the
// encrypted secret and hashed backup codes. The plaintext backup codes are
// returned exactly once. When enrollment was forced at login (no prior
// session), a full authenticated session is issued on success.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ code?: string }>(event)
  const code = String(body?.code ?? '').trim()

  const { userId, finalize } = await resolveMfaActor(event)

  const existing = await getUserMfaState(userId)
  if (existing?.enabled) {
    throw createError({ statusCode: 409, message: 'Multi-factor authentication is already enabled' })
  }

  const secret = await getMfaEnrollSecret(event)
  if (!secret) {
    throw createError({ statusCode: 400, message: 'Enrollment has expired. Start again.' })
  }

  if (!await verifyTotpToken(secret, code)) {
    throw createError({ statusCode: 400, message: 'Invalid verification code' })
  }

  const user = await findUserById(userId)
  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  const backupCodes = await generateBackupCodes()
  await enableUserMfa(userId, {
    encryptedSecret: encryptMfaSecret(secret),
    backupCodeHashes: backupCodes.hashes
  })

  recordActivity(event, {
    action: 'auth.mfa.enabled',
    resource_type: 'session',
    resource_id: user.id,
    metadata: { username: user.username },
    description: 'Multi-factor authentication enabled'
  })

  if (finalize) {
    // Forced enrollment: finalize the login that was held pending.
    const sessionUser = toSessionUser(user)
    await replaceUserSession(event, {
      user: sessionUser,
      loggedInAt: new Date().toISOString()
    })
    await touchUserLogin(sessionUser.id)

    recordActivity(event, {
      action: 'auth.login',
      resource_type: 'session',
      resource_id: sessionUser.id,
      metadata: { username: sessionUser.username, role: sessionUser.role, mfa: true },
      description: 'User signed in'
    })
    dispatchSecurityAlert('login.success', alertDetailsFromEvent(event, {
      username: sessionUser.username,
      reason: `Role: ${sessionUser.role} (MFA enrolled)`
    }))

    return { enabled: true, backup_codes: backupCodes.plain, user: sessionUser }
  }

  // Self-service enrollment: keep the current session, drop the pending secret.
  await clearMfaEnroll(event)

  return { enabled: true, backup_codes: backupCodes.plain }
})
