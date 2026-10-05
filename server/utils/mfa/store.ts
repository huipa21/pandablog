import { createError } from 'h3'
import { queryDb, useDb } from '../db'
import { firstRow, recordIdPart } from '../surrealResult'
import { newAuthEpoch, USERS_TABLE } from '../users'

export interface UserMfaState {
  enabled: boolean
  enabled_at: string | null
  /** Encrypted TOTP secret payload, or null when MFA is not configured. */
  secret: string | null
  /** Argon2id hashes of the remaining unused backup codes. */
  backupCodes: string[]
}

function resolveUserId(idOrUsername: string): string {
  const id = recordIdPart(idOrUsername, USERS_TABLE)
  if (!id) {
    throw createError({ statusCode: 400, message: 'Invalid user reference' })
  }
  return id
}

function serializeDate(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export async function getUserMfaState(idOrUsername: string): Promise<UserMfaState | null> {
  const id = resolveUserId(idOrUsername)
  const db = await useDb()
  const response = await queryDb(
    db,
    'SELECT totp_enabled, totp_secret, totp_backup_codes, totp_enabled_at FROM type::record($table, $id);',
    { table: USERS_TABLE, id }
  )

  const row = firstRow<Record<string, unknown>>(response)
  if (!row) {
    return null
  }

  const backupCodes = Array.isArray(row.totp_backup_codes)
    ? (row.totp_backup_codes as unknown[]).map(value => String(value))
    : []

  return {
    enabled: row.totp_enabled === true,
    enabled_at: serializeDate(row.totp_enabled_at),
    secret: typeof row.totp_secret === 'string' && row.totp_secret ? row.totp_secret : null,
    backupCodes
  }
}

export async function enableUserMfa(
  idOrUsername: string,
  input: { encryptedSecret: string, backupCodeHashes: string[], authEpoch: string, initialStep?: number }
): Promise<string> {
  if (!/^[a-f0-9]{48}$/.test(input.authEpoch) || typeof input.encryptedSecret !== 'string' || !input.encryptedSecret || input.encryptedSecret.length > 1024 || input.backupCodeHashes.length > 10 || input.backupCodeHashes.some(hash => typeof hash !== 'string' || !hash || hash.length > 512) || (input.initialStep !== undefined && (!Number.isSafeInteger(input.initialStep) || input.initialStep < 0))) throw createError({statusCode: 400, message: 'Invalid MFA enrollment state'})
  const id = resolveUserId(idOrUsername)
  const db = await useDb()
  const authEpoch = newAuthEpoch()
  const response = await queryDb(
    db,
    `UPDATE type::record($table, $id) MERGE {
      auth_epoch: $authEpoch,
      totp_enabled: true,
      totp_secret: $secret,
      totp_backup_codes: $backupCodes,
      totp_enabled_at: time::now(),
      totp_last_step: $initialStep,
      updated_at: time::now()
    } WHERE active = true AND auth_epoch = $expectedEpoch AND totp_enabled != true;`,
    {
      table: USERS_TABLE,
      id,
      expectedEpoch: input.authEpoch,
      authEpoch,
      initialStep: input.initialStep,
      secret: input.encryptedSecret,
      backupCodes: input.backupCodeHashes
    }, {retryOnReconnect: false}
  )

  if (!firstRow<Record<string, unknown>>(response)) {
    throw createError({ statusCode: 409, message: 'Account security state changed' })
  }
  return authEpoch
}

export async function disableUserMfa(idOrUsername: string, expectedEpoch: string): Promise<void> {
  const id = resolveUserId(idOrUsername)
  const db = await useDb()
  const response = await queryDb(
    db,
    `UPDATE type::record($table, $id) MERGE {
      auth_epoch: $authEpoch,
      totp_enabled: false,
      totp_secret: NONE,
      totp_backup_codes: NONE,
      totp_enabled_at: NONE,
      totp_last_step: NONE,
      updated_at: time::now()
    } WHERE active = true AND auth_epoch = $expectedEpoch;`,
    { table: USERS_TABLE, id, expectedEpoch, authEpoch: newAuthEpoch() },
    {retryOnReconnect: false}
  )
  if (!firstRow(response)) throw createError({statusCode: 409, message: 'Account security state changed'})
}

interface FactorContext {authEpoch: string, secret: string}
function factorParams(id: string, context: FactorContext) {
  if (!/^[a-f0-9]{48}$/.test(context.authEpoch) || typeof context.secret !== 'string' || !context.secret || context.secret.length > 1024) throw createError({statusCode: 400, message: 'Invalid MFA claim'})
  return {table: USERS_TABLE, id: resolveUserId(id), expectedEpoch: context.authEpoch, secret: context.secret}
}
async function conditionalClaim(sql: string, params: Record<string, unknown>): Promise<boolean> {
  const db = await useDb()
  for (let attempt = 0; attempt < 4; attempt++) {
    try {return Boolean(firstRow(await queryDb(db, sql, params, {retryOnReconnect: false, label: 'conditional MFA factor claim'})))}
    catch (error) {
      // Only the server's confirmed transaction-conflict rollback is retryable.
      // Transport/timeouts/unknown writes are NEVER replayed.
      if (!(error instanceof Error) || !/transaction.*(?:conflict|failed to commit.*retry)/i.test(error.message)) throw error
    }
  }
  throw createError({statusCode: 503, message: 'MFA claim conflicted; retry authentication'})
}
export async function consumeRecoveryHash(id: string, context: FactorContext, hash: string): Promise<boolean> {
  if (typeof hash !== 'string' || !hash || hash.length > 512) throw createError({statusCode: 400, message: 'Invalid recovery claim'})
  return conditionalClaim(`UPDATE type::record($table, $id) SET
    totp_backup_codes = array::difference(totp_backup_codes, [$hash]), updated_at = time::now()
    WHERE active = true AND auth_epoch = $expectedEpoch AND totp_enabled = true
      AND totp_secret = $secret AND totp_backup_codes CONTAINS $hash RETURN AFTER;`, {...factorParams(id, context), hash})
}
export async function claimTotpStep(id: string, context: FactorContext, step: number): Promise<boolean> {
  if (!Number.isSafeInteger(step) || step < 0) throw createError({statusCode: 400, message: 'Invalid TOTP claim'})
  return conditionalClaim(`UPDATE type::record($table, $id) SET totp_last_step = $step, updated_at = time::now()
    WHERE active = true AND auth_epoch = $expectedEpoch AND totp_enabled = true AND totp_secret = $secret
      AND (totp_last_step IS NONE OR totp_last_step < $step) RETURN AFTER;`, {...factorParams(id, context), step})
}
