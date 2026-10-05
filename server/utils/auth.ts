import { createError, type H3Event } from 'h3'
import { isSetupCompleted } from './settings'
import { hasAuthSessionCookie } from './session-cookie'
import { findAuthAccountById, type SessionUser, type UserRole } from './users'
import { getRuntimeModuleConfig, resolveModuleFlags } from '~/utils/moduleFlags'

export interface AdminUser { id: string, username: string, role: 'superadmin' | 'admin', display_name?: string | null }
const identities = new WeakMap<H3Event, Promise<SessionUser | null>>()
const accounts = new WeakMap<H3Event, {id: string, value: ReturnType<typeof findAuthAccountById>}>()
export function getRequestAuthAccount(event: H3Event, id: string) {
  const cached = accounts.get(event)
  if (cached?.id === id) return cached.value
  const value = findAuthAccountById(id).catch(() => {throw createError({statusCode: 503, message: 'Identity service unavailable'})})
  accounts.set(event, {id, value})
  return value
}
export function accountAllowedInModuleMode(user: Pick<SessionUser, 'id' | 'username'>): boolean {
  return resolveModuleFlags(getRuntimeModuleConfig()).multiUser || (user.id === 'users:admin' && user.username === 'admin')
}

/** Cookie display fields NEVER authorize; positive identity is request-local. */
export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  let identity = identities.get(event)
  if (!identity) { identity = resolveCurrentIdentity(event); identities.set(event, identity) }
  return identity
}
async function resolveCurrentIdentity(event: H3Event): Promise<SessionUser | null> {
  if (!hasAuthSessionCookie(event)) return null
  const session = await getUserSession(event)
  const id = (session.user as {id?: unknown} | undefined)?.id
  const epoch = (session.secure as {authEpoch?: unknown} | undefined)?.authEpoch
  if (typeof id !== 'string' || !/^users:[a-z0-9._-]{3,64}$/.test(id) || typeof epoch !== 'string' || !/^[a-f0-9]{48}$/.test(epoch)) return null
  const account = await getRequestAuthAccount(event, id)
  if (!account || account.active !== true || account.auth_epoch !== epoch || !accountAllowedInModuleMode(account)) return null
  // Explicit DTO: epochs/credential/MFA fields never escape through user APIs.
  return { id: account.id, username: account.username, role: account.role,
    display_name: account.display_name, avatar: account.avatar, avatar_url: account.avatar_url }
}

export async function requireUser(event: H3Event, options: {roles?: readonly UserRole[]} = {}): Promise<SessionUser> {
  if (!await isSetupCompleted()) throw createError({statusCode: 503, message: 'Admin setup is required'})
  const user = await getSessionUser(event)
  if (!user) throw createError({statusCode: 401, message: 'Authentication required'})
  if (options.roles?.length && !options.roles.includes(user.role)) throw createError({statusCode: 403, message: 'Insufficient permissions'})
  return user
}
export async function requireSuperadmin(event: H3Event): Promise<SessionUser & {role: 'superadmin'}> {
  return await requireUser(event, {roles: ['superadmin']}) as SessionUser & {role: 'superadmin'}
}
export async function requireAdminTier(event: H3Event): Promise<AdminUser> {
  return await requireUser(event, {roles: ['superadmin', 'admin']}) as AdminUser
}
export async function requireContentManager(event: H3Event): Promise<SessionUser & {role: 'superadmin' | 'admin' | 'author'}> {
  return await requireUser(event, {roles: ['superadmin', 'admin', 'author']}) as SessionUser & {role: 'superadmin' | 'admin' | 'author'}
}
export async function requireAuthenticatedUser(event: H3Event): Promise<SessionUser> { return requireUser(event) }
export async function isAdminAuthenticated(event: H3Event): Promise<boolean> { return isAdminTier(await getSessionUser(event)) }
export async function isAuthenticated(event: H3Event): Promise<boolean> { return Boolean(await getSessionUser(event)) }
export function isAdminTier(user: SessionUser | null | undefined): user is SessionUser & {role: 'superadmin' | 'admin'} {
  return Boolean(user && accountAllowedInModuleMode(user) && (user.role === 'superadmin' || user.role === 'admin'))
}
