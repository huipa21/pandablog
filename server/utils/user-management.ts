import type { SessionUser, UserRecord, UserRole } from './users'

export function canSeeManagedUser(actor: SessionUser, target: UserRecord) {
  if (target.role === 'superadmin') return false
  if (actor.role === 'superadmin') return true
  if (actor.role === 'admin') return target.role === 'author' || target.role === 'viewer'
  return false
}

export function assertCanCreateUserRole(actor: SessionUser, role: UserRole) {
  if (role === 'superadmin') {
    throw createError({ statusCode: 403, message: 'The superadmin role is reserved for the system account' })
  }

  if (actor.role === 'superadmin') return
  if (actor.role === 'admin' && (role === 'author' || role === 'viewer')) return
  throw createError({ statusCode: 403, message: 'You cannot create users with that role' })
}

export function assertCanManageTargetUser(actor: SessionUser, target: UserRecord) {
  if (target.role === 'superadmin') {
    throw createError({ statusCode: 403, message: 'The superadmin account is managed from its own profile only' })
  }

  if (actor.role === 'superadmin') return
  if (actor.role === 'admin' && (target.role === 'author' || target.role === 'viewer')) return

  throw createError({ statusCode: 403, message: 'You cannot manage that user' })
}

export function assertNotSelf(actor: SessionUser, target: UserRecord, message: string) {
  if (actor.id === target.id) {
    throw createError({ statusCode: 400, message })
  }
}