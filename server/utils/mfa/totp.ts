import { randomInt } from 'node:crypto'
import { generateSecret, generateURI, verify } from 'otplib'
import { hashAdminPassword, verifyAdminPassword } from '../admin-password'

export const TOTP_ISSUER = 'Pandablog'
export const BACKUP_CODE_COUNT = 10

// Unambiguous alphabet (no 0/O/1/I) for human-typed backup codes.
const BACKUP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const BACKUP_GROUP = 5

// Accept ±1 time step (30s) of clock drift on either side.
const EPOCH_TOLERANCE_SECONDS = 30

export function generateTotpSecret(): string {
  return generateSecret()
}

export function buildTotpUri(secret: string, account: string): string {
  return generateURI({ issuer: TOTP_ISSUER, label: account, secret })
}

export async function verifyTotpToken(secret: string, token: string, epoch = Math.floor(Date.now() / 1000)): Promise<number | null> {
  if (typeof token !== 'string' || token.length > 64 || typeof secret !== 'string' || secret.length > 128) return null
  const normalized = token.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(normalized)) {
    return null
  }

  try {
    const result = await verify({ strategy: 'totp', secret, token: normalized, epoch, epochTolerance: EPOCH_TOLERANCE_SECONDS })
    return result.valid && 'timeStep' in result && Number.isSafeInteger(result.timeStep) ? result.timeStep : null
  } catch {
    return null
  }
}

function randomBackupCode(): string {
  const left = pickGroup()
  const right = pickGroup()
  return `${left}-${right}`
}

function pickGroup(): string {
  let group = ''
  for (let i = 0; i < BACKUP_GROUP; i += 1) {
    group += BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)]
  }
  return group
}

export function normalizeBackupCode(value: unknown): string {
  return typeof value === 'string' && value.length <= 64 ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
}

export interface GeneratedBackupCodes {
  /** Plaintext codes shown to the user exactly once. */
  plain: string[]
  /** Argon2id hashes persisted in the database. */
  hashes: string[]
}

export async function generateBackupCodes(signal?: AbortSignal): Promise<GeneratedBackupCodes> {
  const plain: string[] = []
  const seen = new Set<string>()
  while (plain.length < BACKUP_CODE_COUNT) {
    const code = randomBackupCode()
    if (seen.has(code)) continue
    seen.add(code)
    plain.push(code)
  }

  // Hash the normalized form so verification is dash/case insensitive.
  const hashes: string[] = []
  for (const code of plain) hashes.push(await hashAdminPassword(normalizeBackupCode(code), signal))
  return { plain, hashes }
}

/**
 * Verify a typed backup code against the stored hashes. Returns the index of
 * the matching hash so the caller can consume (remove) it, or -1 when no code
 * matches.
 */
export async function matchBackupCode(storedHashes: string[], code: string, signal?: AbortSignal): Promise<number> {
  const normalized = normalizeBackupCode(code)
  if (normalized.length !== 10 || storedHashes.length > BACKUP_CODE_COUNT) {
    return -1
  }

  for (let i = 0; i < storedHashes.length; i += 1) {
    const hash = storedHashes[i]
    if (hash && await verifyAdminPassword(hash, normalized, signal)) {
      return i
    }
  }
  return -1
}
