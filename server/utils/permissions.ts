import { queryDb } from './db'
import { queryRows } from './surrealResult'
import { stringifyRecordId } from './surrealResult'
import type { SessionUser } from './users'

export function canManageAllContent(user: SessionUser) {
  return user.role === 'superadmin' || user.role === 'admin'
}

export function isOwnedByUser(record: Record<string, unknown>, ownerField: string, usernameField: string, user: SessionUser) {
  const ownerId = record[ownerField] ? stringifyRecordId(record[ownerField]) : ''
  if (ownerId && ownerId === user.id) {
    return true
  }

  return String(record[usernameField] ?? '') === user.username
}

export function assertCanManagePostRecord(user: SessionUser, post: Record<string, unknown>) {
  if (canManageAllContent(user)) {
    return
  }

  if (isOwnedByUser(post, 'author', 'author_username', user)) {
    return
  }

  throw createError({ statusCode: 403, message: 'You can only manage your own posts' })
}

export function assertCanManageOwnedRecord(
  user: SessionUser,
  record: Record<string, unknown>,
  options: { ownerField: string, usernameField?: string, message: string }
) {
  if (canManageAllContent(user)) {
    return
  }

  const ownerId = record[options.ownerField] ? stringifyRecordId(record[options.ownerField]) : ''
  if (ownerId === user.id) {
    return
  }

  if (options.usernameField && String(record[options.usernameField] ?? '') === user.username) {
    return
  }

  throw createError({ statusCode: 403, message: options.message })
}

export async function assertNoOtherAuthorTaxonomyUsage(
  db: Parameters<typeof queryDb>[0],
  user: SessionUser,
  relation: 'tagged' | 'categorized_as',
  taxonomyTable: 'tag' | 'category',
  taxonomyId: string
) {
  if (canManageAllContent(user)) {
    return
  }

  const response = await queryDb(
    db,
    `SELECT in.author AS author, in.author_username AS author_username
     FROM ${relation}
     WHERE out = type::record($taxonomyTable, $taxonomyId);`,
    { taxonomyTable, taxonomyId }
  )

  const rows = queryRows<Record<string, unknown>>(response)
  const hasOtherAuthorUsage = rows.some((row) => !isOwnedByUser(row, 'author', 'author_username', user))
  if (hasOtherAuthorUsage) {
    throw createError({ statusCode: 409, message: 'This term is used by another author\'s post' })
  }
}