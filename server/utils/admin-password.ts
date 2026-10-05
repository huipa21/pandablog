import argon2 from 'argon2'
import { createError } from 'h3'
import { passwordAdmission } from './admission'

export const ADMIN_PASSWORD_MIN_LENGTH = 8

export function adminPasswordProblem(password: string) {
  if (typeof password !== 'string' || password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`
  }

  if (password.length > 200) {
    return 'Password is too long'
  }

  return ''
}

export async function hashAdminPassword(password: string, signal?: AbortSignal) {
  if (typeof password !== 'string' || !password || password.length > 200) throw createError({statusCode: 400, message: 'Invalid password input'})
  return passwordAdmission.run(() => argon2.hash(password, {
    type: argon2.argon2id, memoryCost: 2 ** 16, timeCost: 3, parallelism: 4
  }), signal)
}

export async function verifyAdminPassword(hash: string, password: string, signal?: AbortSignal) {
  if (typeof password !== 'string' || !password || password.length > 200 || typeof hash !== 'string' || hash.length > 512) return false
  const cost = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(hash)
  if (!cost || Number(cost[1]) > 65536 || Number(cost[2]) > 3 || Number(cost[3]) > 4) return false
  return passwordAdmission.run(async () => {
    try { return await argon2.verify(hash, password) } catch { return false }
  }, signal) // admission/abort/shutdown errors must not become bad-password results
}