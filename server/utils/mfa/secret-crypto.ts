import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

// Authenticated encryption (AES-256-GCM) for TOTP secrets stored at rest.
//
// The 32-byte key is derived with scrypt from a configured key source:
//   1. NUXT_MFA_SECRET (runtimeConfig.mfaSecret) when provided, OR
//   2. the session cookie password (runtimeConfig.session.password) as a
//      back-compatible fallback so MFA works out of the box.
//
// IMPORTANT: rotating the key source invalidates every stored secret and
// requires affected users to re-enroll. This is documented in the Readme.

const KEY_SALT = 'pandablog::mfa::totp'
const VERSION = 'v1'

function resolveKeySource(): string {
  const config = useRuntimeConfig()
  const dedicated = typeof config.mfaSecret === 'string' ? config.mfaSecret.trim() : ''
  if (dedicated) {
    return dedicated
  }

  const sessionPassword = typeof config.session?.password === 'string' ? config.session.password : ''
  if (sessionPassword && sessionPassword.length >= 16) {
    return sessionPassword
  }

  throw createError({ statusCode: 500, message: 'MFA encryption key is not configured' })
}

function deriveKey(): Buffer {
  return scryptSync(resolveKeySource(), KEY_SALT, 32)
}

export function encryptMfaSecret(plain: string): string {
  if (typeof plain !== 'string' || !plain) {
    throw createError({ statusCode: 500, message: 'Cannot encrypt an empty MFA secret' })
  }

  const key = deriveKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [VERSION, iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':')
}

export function decryptMfaSecret(payload: string): string {
  const parts = String(payload ?? '').split(':')
  const [version, ivHex, tagHex, ctHex] = parts
  if (parts.length !== 4 || version !== VERSION || !ivHex || !tagHex || !ctHex) {
    throw createError({ statusCode: 500, message: 'Invalid stored MFA secret' })
  }

  const key = deriveKey()
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(tagHex, 'hex')
  const ciphertext = Buffer.from(ctHex, 'hex')

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
