import { timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { isSetupCompleted } from './settings'

export interface AdminUser {
  username: string
  role: 'admin'
}

export function constantTimeEqual(input: string, expected: string) {
  const inputBuffer = Buffer.from(input)
  const expectedBuffer = Buffer.from(expected)

  if (inputBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(inputBuffer, expectedBuffer)
}

export async function requireAdminUser(event: H3Event): Promise<AdminUser> {
  if (!await isSetupCompleted()) {
    throw createError({ statusCode: 503, message: 'Admin setup is required' })
  }

  const session = await requireUserSession(event)
  const user = session.user as AdminUser | undefined

  if (!user || user.role !== 'admin') {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  return user
}

export async function requireAdmin(event: H3Event): Promise<AdminUser> {
  return requireAdminUser(event)
}

/**
 * Non-throwing variant of requireAdminUser.
 * Returns true if the request has a valid admin session, false otherwise.
 */
export async function isAdminAuthenticated(event: H3Event): Promise<boolean> {
  try {
    const session = await getUserSession(event)
    const user = session.user as AdminUser | undefined
    return Boolean(user && user.role === 'admin')
  } catch {
    return false
  }
}