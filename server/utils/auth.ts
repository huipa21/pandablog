import type { H3Event } from 'h3'
import { isSetupCompleted } from './settings'
import type { SessionUser, UserRole } from './users'

export interface AdminUser {
  id: string
  username: string
  role: 'superadmin' | 'admin'
  display_name?: string | null
}

export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  const session = await getUserSession(event)
  const user = session.user as SessionUser | undefined

  if (!user || !user.id || !user.username || !isRole(user.role)) {
    return null
  }

  return user
}

export async function requireUser(event: H3Event, options: { roles?: readonly UserRole[] } = {}): Promise<SessionUser> {
  if (!await isSetupCompleted()) {
    throw createError({ statusCode: 503, message: 'Admin setup is required' })
  }

  const session = await requireUserSession(event)
  const user = session.user as SessionUser | undefined

  if (!user || !user.id || !user.username || !isRole(user.role)) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  if (options.roles?.length && !options.roles.includes(user.role)) {
    throw createError({ statusCode: 403, message: 'Insufficient permissions' })
  }

  return user
}

export async function requireSuperadmin(event: H3Event): Promise<SessionUser & { role: 'superadmin' }> {
  return await requireUser(event, { roles: ['superadmin'] }) as SessionUser & { role: 'superadmin' }
}

export async function requireAdminTier(event: H3Event): Promise<AdminUser> {
  return await requireUser(event, { roles: ['superadmin', 'admin'] }) as AdminUser
}

export async function requireContentManager(event: H3Event): Promise<SessionUser & { role: 'superadmin' | 'admin' | 'author' }> {
  return await requireUser(event, { roles: ['superadmin', 'admin', 'author'] }) as SessionUser & { role: 'superadmin' | 'admin' | 'author' }
}

export async function requireAuthenticatedUser(event: H3Event): Promise<SessionUser> {
  return requireUser(event)
}

/**
 * Non-throwing admin session check.
 * Returns true if the request has a valid admin session, false otherwise.
 */
export async function isAdminAuthenticated(event: H3Event): Promise<boolean> {
  try {
    const user = await getSessionUser(event)
    return Boolean(user && (user.role === 'superadmin' || user.role === 'admin'))
  } catch {
    return false
  }
}

export async function isAuthenticated(event: H3Event): Promise<boolean> {
  try {
    return Boolean(await getSessionUser(event))
  } catch {
    return false
  }
}

export function isAdminTier(user: SessionUser | null | undefined): user is SessionUser & { role: 'superadmin' | 'admin' } {
  return Boolean(user && (user.role === 'superadmin' || user.role === 'admin'))
}

function isRole(value: unknown): value is UserRole {
  return value === 'superadmin' || value === 'admin' || value === 'author' || value === 'viewer'
}