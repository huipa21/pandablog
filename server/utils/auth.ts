import { timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

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
  const session = await requireUserSession(event)
  const user = session.user as AdminUser | undefined

  if (!user || user.role !== 'admin') {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  return user
}