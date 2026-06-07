import type { SessionUser, UserRecord, UserRole } from './users'

export function canSeeManagedUser(actor: SessionUser, target: UserRecord) {
  if (actor.role === 'superadmin') return true
  if (actor.role === 'admin') return target.role === 'author' || target.role === 'viewer'
  return false
}

export function assertCanCreateUserRole(actor: SessionUser, role: UserRole) {
  if (actor.role === 'superadmin') return
  if (actor.role === 'admin' && (role === 'author' || role === 'viewer')) return
  throw createError({ statusCode: 403, message: 'You cannot create users with that role' })
}

export function assertCanManageTargetUser(actor: SessionUser, target: UserRecord) {
  if (target.id === 'users:admin' && actor.id !== 'users:admin') {
    throw createError({ statusCode: 403, message: 'Only the seed admin can manage the seed admin account' })
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