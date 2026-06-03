import argon2 from 'argon2'

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

export async function hashAdminPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 4
  })
}

export async function verifyAdminPassword(hash: string, password: string) {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}