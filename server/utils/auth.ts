import type { H3Event } from 'h3'
import { isSetupCompleted } from './settings'
import { hasAuthSessionCookie } from './session-cookie'
import type { SessionUser, UserRole } from './users'

export interface AdminUser {
  id: string
  username: string
  role: 'superadmin' | 'admin'
  display_name?: string | null
}

export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  if (!hasAuthSessionCookie(event)) {
    return null
  }

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

  const effectiveUser = effectiveUserForModuleMode(user)

  if (options.roles?.length && !options.roles.includes(effectiveUser.role)) {
    throw createError({ statusCode: 403, message: 'Insufficient permissions' })
  }

  return effectiveUser
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
    if (!isMultiUserModeEnabled()) {
      return Boolean(user)
    }
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
  if (!isMultiUserModeEnabled()) {
    return Boolean(user)
  }

  return Boolean(user && (user.role === 'superadmin' || user.role === 'admin'))
}

function effectiveUserForModuleMode(user: SessionUser): SessionUser {
  if (isMultiUserModeEnabled()) {
    return user
  }

  return {
    ...user,
    role: 'superadmin'
  }
}

function isMultiUserModeEnabled() {
  const modules = useRuntimeConfig().public.modules as { users?: { enabled?: boolean, multiUser?: boolean } } | undefined
  return modules?.users?.enabled !== false && modules?.users?.multiUser !== false
}

function isRole(value: unknown): value is UserRole {
  return value === 'superadmin' || value === 'admin' || value === 'author' || value === 'viewer'
}