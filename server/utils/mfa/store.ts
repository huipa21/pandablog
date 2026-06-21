import { queryDb, useDb } from '../db'
import { firstRow, recordIdPart } from '../surrealResult'
import { USERS_TABLE } from '../users'

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
  input: { encryptedSecret: string, backupCodeHashes: string[] }
): Promise<void> {
  const id = resolveUserId(idOrUsername)
  const db = await useDb()
  const response = await queryDb(
    db,
    `UPDATE type::record($table, $id) MERGE {
      totp_enabled: true,
      totp_secret: $secret,
      totp_backup_codes: $backupCodes,
      totp_enabled_at: time::now(),
      updated_at: time::now()
    };`,
    {
      table: USERS_TABLE,
      id,
      secret: input.encryptedSecret,
      backupCodes: input.backupCodeHashes
    }
  )

  if (!firstRow<Record<string, unknown>>(response)) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }
}

export async function disableUserMfa(idOrUsername: string): Promise<void> {
  const id = resolveUserId(idOrUsername)
  const db = await useDb()
  await queryDb(
    db,
    `UPDATE type::record($table, $id) MERGE {
      totp_enabled: false,
      totp_secret: NONE,
      totp_backup_codes: NONE,
      totp_enabled_at: NONE,
      updated_at: time::now()
    };`,
    { table: USERS_TABLE, id }
  )
}

/** Persist the remaining backup-code hashes after one has been consumed. */
export async function setUserBackupCodes(idOrUsername: string, hashes: string[]): Promise<void> {
  const id = resolveUserId(idOrUsername)
  const db = await useDb()
  await queryDb(
    db,
    'UPDATE type::record($table, $id) MERGE { totp_backup_codes: $backupCodes, updated_at: time::now() };',
    { table: USERS_TABLE, id, backupCodes: hashes }
  )
}
