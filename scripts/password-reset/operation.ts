import { randomBytes } from 'node:crypto'
import type { Surreal } from 'surrealdb'
import { adminPasswordProblem, hashAdminPassword } from '../../server/utils/admin-password'
import { firstRow } from '../../server/utils/surrealResult'
import { PasswordResetError } from './prompt'

export function resetUsername(value: string) {
  const username = value.trim().toLowerCase()
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) {
    throw new PasswordResetError('Username must be 3–64 characters using letters, numbers, dots, underscores or hyphens.')
  }
  return username
}

export function validateResetPassword(password: string, confirmation: string) {
  const problem = adminPasswordProblem(password)
  if (problem) throw new PasswordResetError(problem)
  if (password !== confirmation) throw new PasswordResetError('Passwords do not match. No password was changed.')
}

/** UPDATE (never UPSERT): unknown usernames cannot create accounts. */
export async function resetPassword(db: Pick<Surreal, 'query'>, username: string, password: string, confirmation: string) {
  username = resetUsername(username)
  validateResetPassword(password, confirmation)
  let passwordHash: string
  try { passwordHash = await hashAdminPassword(password) }
  catch { throw new PasswordResetError('Could not hash the password. No password was changed.') }

  let response: unknown
  try {
    response = await db.query(`UPDATE users SET password_hash = $passwordHash,
      auth_epoch = $authEpoch, updated_at = time::now()
      WHERE username = $username RETURN id;`, {
      username,
      passwordHash,
      authEpoch: randomBytes(24).toString('hex')
    })
  } catch {
    // SDK/database errors can include SQL parameters; never print the original.
    throw new PasswordResetError('Database update failed. Its outcome may be uncertain; verify sign-in before retrying.', true)
  }
  if (!firstRow(response)) throw new PasswordResetError(`User '${username}' was not found. No password was changed.`)
}
