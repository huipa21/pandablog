import { decryptMfaSecret } from './secret-crypto'
import { claimTotpStep, consumeRecoveryHash, type UserMfaState } from './store'
import { matchBackupCode, verifyTotpToken } from './totp'

/** Slow verification is outside the atomic, conditional claim. A failed or
 * uncertain claim never issues a session and is never retried as a disconnect.
 */
export async function consumeMfaFactor(userId: string, authEpoch: string, state: UserMfaState, code: string, signal?: AbortSignal): Promise<{ok: boolean, usedBackupCode: boolean}> {
  if (!state.enabled || !state.secret) return {ok: false, usedBackupCode: false}
  const step = await verifyTotpToken(await decryptMfaSecret(state.secret), code)
  const context = {authEpoch, secret: state.secret}
  if (step !== null) return {ok: await claimTotpStep(userId, context, step), usedBackupCode: false}
  const index = await matchBackupCode(state.backupCodes, code, signal)
  if (index < 0) return {ok: false, usedBackupCode: false}
  const ok = await consumeRecoveryHash(userId, context, state.backupCodes[index]!)
  return {ok, usedBackupCode: ok}
}
