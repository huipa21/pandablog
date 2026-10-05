import { describe, expect, it, vi } from 'vitest'
import { generate, generateSecret } from 'otplib'
import { verifyTotpToken } from '../../server/utils/mfa/totp'
import { decryptMfaSecret, encryptMfaSecret } from '../../server/utils/mfa/secret-crypto'

const crypto = vi.hoisted(() => ({scrypt: vi.fn()}))
vi.mock('node:crypto', async original => {
  const actual = await original<typeof import('node:crypto')>()
  crypto.scrypt.mockImplementation(actual.scrypt)
  return {...actual, scrypt: crypto.scrypt}
})

describe('MFA timestep and bounded key derivation', () => {
  it('returns actual accepted timestep, including future drift and rejects malformed input', async () => {
    const secret = generateSecret(), epoch = 1_800_000_000
    const future = await generate({secret, epoch: epoch + 30})
    expect(await verifyTotpToken(secret, future, epoch)).toBe(epoch / 30 + 1)
    const previous = await generate({secret, epoch: epoch - 30})
    expect(await verifyTotpToken(secret, previous, epoch)).toBe(epoch / 30 - 1)
    expect(await verifyTotpToken(secret, 'not-a-code', epoch)).toBeNull()
    expect(await verifyTotpToken(secret, 'x'.repeat(65), epoch)).toBeNull()
  })
  it('derives asynchronously once for concurrent encrypt/decrypt; rejects malformed/tampered envelopes and key-source churn', async () => {
    const source = 'fixture-only-key-at-least-32-characters'
    vi.stubGlobal('useRuntimeConfig', () => ({mfaSecret: source}))
    try {
      const secret = generateSecret()
      const payloads = await Promise.all(Array.from({length: 20}, () => encryptMfaSecret(secret)))
      expect(crypto.scrypt).toHaveBeenCalledTimes(1)
      expect(await Promise.all(payloads.map(decryptMfaSecret))).toEqual(Array(20).fill(secret))
      for (const payload of ['v1:00:00:00', 'v2:malformed', 'x'.repeat(1025), payloads[0]!.replace(/^v1:[a-f0-9]{24}/, `v1:${'0'.repeat(24)}`)]) await expect(decryptMfaSecret(payload)).rejects.toThrow()
      vi.stubGlobal('useRuntimeConfig', () => ({mfaSecret: 'different-key-source-also-at-least-32'}))
      await expect(encryptMfaSecret(secret)).rejects.toMatchObject({statusCode: 503})
      expect(crypto.scrypt).toHaveBeenCalledTimes(1)
    } finally {vi.unstubAllGlobals()}
  })
})
