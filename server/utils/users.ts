import { adminPasswordProblem, hashAdminPassword, verifyAdminPassword } from './admin-password'
import { queryDb, useDb } from './db'
import { firstRow, queryRows, recordIdPart, stringifyRecordId } from './surrealResult'

export const USERS_TABLE = 'users'

export type UserRole = 'superadmin' | 'admin' | 'author' | 'viewer'
export type UserActiveFilter = 'all' | 'enabled' | 'disabled'
export type UserListSort = typeof USER_LIST_SORTS[number]

export interface UserRecord {
  id: string
  username: string
  role: UserRole
  display_name: string | null
  email: string | null
  avatar: string | null
  avatar_url: string | null
  active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface UserWithPassword extends UserRecord {
  password_hash: string
}

export interface SessionUser {
  id: string
  username: string
  role: UserRole
  display_name?: string | null
  avatar?: string | null
  avatar_url?: string | null
}

interface CreateUserInput {
  username: string
  password: string
  role: UserRole
  display_name?: string | null
  email?: string | null
  avatar?: string | null
  active?: boolean
}

interface CreateUserWithHashInput {
  username: string
  password_hash: string
  role: UserRole
  display_name?: string | null
  email?: string | null
  avatar?: string | null
  active?: boolean
}

interface UpdateUserInput {
  role?: UserRole
  display_name?: string | null
  email?: string | null
  avatar?: string | null
  active?: boolean
}

interface SearchUsersOptions {
  actor?: Pick<SessionUser, 'role'> | null
  search?: string
  role?: UserRole | 'all'
  active?: UserActiveFilter
  sort?: UserListSort
  limit?: number
  start?: number
}

export const USER_ROLES: UserRole[] = ['superadmin', 'admin', 'author', 'viewer']
export const USER_LIST_SORTS = [
  'username_asc',
  'username_desc',
  'display_name_asc',
  'display_name_desc',
  'last_login_desc',
  'last_login_asc',
  'created_desc',
  'created_asc'
] as const

const userSortOrders: Record<UserListSort, string> = {
  username_asc: 'username ASC',
  username_desc: 'username DESC',
  display_name_asc: 'display_name ASC, username ASC',
  display_name_desc: 'display_name DESC, username ASC',
  last_login_desc: 'last_login_at DESC, username ASC',
  last_login_asc: 'last_login_at ASC, username ASC',
  created_desc: 'created_at DESC, username ASC',
  created_asc: 'created_at ASC, username ASC'
}

export function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.includes(value as UserRole)
}

export function normalizeUsername(value: unknown) {
  const username = String(value ?? '').trim().toLowerCase()
  if (!username) {
    throw createError({ statusCode: 400, message: 'Username is required' })
  }
  if (username.length < 3) {
    throw createError({ statusCode: 400, message: 'Username must be at least 3 characters' })
  }
  if (username.length > 64) {
    throw createError({ statusCode: 400, message: 'Username must be 64 characters or fewer' })
  }
  if (!/^[a-z0-9._-]+$/.test(username)) {
    throw createError({ statusCode: 400, message: 'Username can only contain letters, numbers, dots, underscores, or hyphens' })
  }

  return username
}

export function userRecordId(username: string) {
  return normalizeUsername(username)
}

export function validateUserPassword(password: string) {
  const problem = adminPasswordProblem(password)
  if (problem) {
    throw createError({ statusCode: 400, message: problem })
  }
}

export async function hashUserPassword(password: string) {
  validateUserPassword(password)
  return hashAdminPassword(password)
}

export async function verifyUserPassword(user: UserWithPassword | null, password: string) {
  if (!user?.password_hash) {
    return false
  }

  return verifyAdminPassword(user.password_hash, password)
}

export function normalizeUser(record: Record<string, unknown>): UserRecord {
  const avatar = normalizeAvatarRecordId(record.avatar, false)
  return {
    id: stringifyRecordId(record.id),
    username: String(record.username ?? ''),
    role: isUserRole(record.role) ? record.role : 'viewer',
    display_name: stringOrNull(record.display_name),
    email: stringOrNull(record.email),
    avatar,
    avatar_url: avatar ? avatarUrlFromRecordId(avatar) : null,
    active: record.active !== false,
    last_login_at: serializeDate(record.last_login_at),
    created_at: serializeDate(record.created_at) ?? new Date().toISOString(),
    updated_at: serializeDate(record.updated_at) ?? new Date().toISOString()
  }
}

export function normalizeUserWithPassword(record: Record<string, unknown>): UserWithPassword {
  return {
    ...normalizeUser(record),
    password_hash: String(record.password_hash ?? '')
  }
}

export function toSessionUser(user: UserRecord): SessionUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    display_name: user.display_name,
    avatar: user.avatar,
    avatar_url: user.avatar_url
  }
}

export async function findUserByUsername(username: string): Promise<UserWithPassword | null> {
  const db = await useDb()
  const response = await queryDb(db, 'SELECT * FROM users WHERE username = $username LIMIT 1;', {
    username: normalizeUsername(username)
  })

  const row = firstRow<Record<string, unknown>>(response)
  return row ? normalizeUserWithPassword(row) : null
}

export async function findUserById(value: string): Promise<UserWithPassword | null> {
  const id = recordIdPart(value, USERS_TABLE)
  if (!id) return null

  const db = await useDb()
  const response = await queryDb(db, 'SELECT * FROM type::record($table, $id) LIMIT 1;', {
    table: USERS_TABLE,
    id
  })

  const row = firstRow<Record<string, unknown>>(response)
  return row ? normalizeUserWithPassword(row) : null
}

export async function searchUsers(options: SearchUsersOptions = {}): Promise<{ users: UserRecord[], total: number }> {
  const db = await useDb()
  const where: string[] = []
  const params: Record<string, unknown> = {}
  const actorRole = options.actor?.role

  where.push('role != $hiddenRole')
  params.hiddenRole = 'superadmin'

  if (actorRole === 'admin') {
    where.push('role IN $visibleRoles')
    params.visibleRoles = ['author', 'viewer']
  } else if (actorRole && actorRole !== 'superadmin') {
    where.push('role IN $visibleRoles')
    params.visibleRoles = []
  }

  const search = options.search?.trim()
  if (search) {
    where.push('(string::lowercase(username) CONTAINS string::lowercase($search) OR (display_name IS NOT NONE AND string::lowercase(display_name) CONTAINS string::lowercase($search)) OR (email IS NOT NONE AND string::lowercase(email) CONTAINS string::lowercase($search)))')
    params.search = search.slice(0, 120)
  }

  if (options.role && options.role !== 'all') {
    where.push('role = $role')
    params.role = options.role
  }

  if (options.active === 'enabled') {
    where.push('active = true')
  } else if (options.active === 'disabled') {
    where.push('active = false')
  }

  const sort = options.sort && USER_LIST_SORTS.includes(options.sort) ? options.sort : 'username_asc'
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limitSql = typeof options.limit === 'number' ? ' LIMIT $limit START $start' : ''

  if (typeof options.limit === 'number') {
    params.limit = Math.min(Math.max(Math.trunc(options.limit), 1), 100)
    params.start = Math.max(Math.trunc(options.start ?? 0), 0)
  }

  const response = await queryDb(
    db,
    `SELECT * FROM users ${whereSql} ORDER BY ${userSortOrders[sort]}${limitSql};
     SELECT count() AS total FROM users ${whereSql} GROUP ALL;`,
    params
  )

  return {
    users: queryRows<Record<string, unknown>>(response, 0).map(normalizeUser),
    total: Number(firstRow<{ total?: number }>(response, 1)?.total ?? 0)
  }
}

export async function listUsers(): Promise<UserRecord[]> {
  const { users } = await searchUsers({ sort: 'username_asc' })
  return users
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  return createUserWithPasswordHash({
    ...input,
    password_hash: await hashUserPassword(input.password)
  })
}

export async function createUserWithPasswordHash(input: CreateUserWithHashInput): Promise<UserRecord> {
  const username = normalizeUsername(input.username)
  const role = input.role
  if (!isUserRole(role)) {
    throw createError({ statusCode: 400, message: 'Invalid role' })
  }
  if (!input.password_hash) {
    throw createError({ statusCode: 400, message: 'Password hash is required' })
  }

  const existing = await findUserByUsername(username)
  if (existing) {
    throw createError({ statusCode: 409, message: 'Username is already in use' })
  }

  const displayName = stringOrNull(input.display_name)
  const email = stringOrNull(input.email)
  const avatar = normalizeAvatarInput(input.avatar)
  const db = await useDb()
  const response = await queryDb(
    db,
    `UPSERT type::record($table, $id) CONTENT {
      username: $username,
      password_hash: $passwordHash,
      role: $role,
      display_name: ${optionalParamExpression(displayName, 'displayName')},
      email: ${optionalParamExpression(email, 'email')},
      avatar: ${avatar.expression},
      active: $active,
      last_login_at: NONE,
      created_at: time::now(),
      updated_at: time::now()
    };`,
    {
      table: USERS_TABLE,
      id: userRecordId(username),
      username,
      passwordHash: input.password_hash,
      role,
      displayName,
      email,
      ...avatar.params,
      active: input.active !== false
    }
  )

  const row = firstRow<Record<string, unknown>>(response)
  if (!row) {
    throw createError({ statusCode: 500, message: 'User was not created' })
  }

  return normalizeUser(row)
}

export async function updateUser(idOrUsername: string, input: UpdateUserInput): Promise<UserRecord> {
  const id = recordIdPart(idOrUsername, USERS_TABLE) || userRecordId(idOrUsername)
  const updates = ['updated_at: time::now()']
  const params: Record<string, unknown> = {
    table: USERS_TABLE,
    id
  }

  if (input.role !== undefined) {
    if (!isUserRole(input.role)) {
      throw createError({ statusCode: 400, message: 'Invalid role' })
    }
    updates.push('role: $role')
    params.role = input.role
  }
  if (input.display_name !== undefined) {
    const displayName = stringOrNull(input.display_name)
    updates.push(`display_name: ${optionalParamExpression(displayName, 'displayName')}`)
    params.displayName = displayName
  }
  if (input.email !== undefined) {
    const email = stringOrNull(input.email)
    updates.push(`email: ${optionalParamExpression(email, 'email')}`)
    params.email = email
  }
  if (input.avatar !== undefined) {
    const avatar = normalizeAvatarInput(input.avatar)
    updates.push(`avatar: ${avatar.expression}`)
    Object.assign(params, avatar.params)
  }
  if (input.active !== undefined) {
    updates.push('active: $active')
    params.active = input.active === true
  }

  const db = await useDb()
  const response = await queryDb(db, `UPDATE type::record($table, $id) MERGE { ${updates.join(', ')} };`, params)

  const row = firstRow<Record<string, unknown>>(response)
  if (!row) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  return normalizeUser(row)
}

export async function setUserPassword(idOrUsername: string, password: string): Promise<void> {
  await setUserPasswordHash(idOrUsername, await hashUserPassword(password))
}

export async function setUserPasswordHash(idOrUsername: string, passwordHash: string): Promise<void> {
  if (!passwordHash) {
    throw createError({ statusCode: 400, message: 'Password hash is required' })
  }

  const id = recordIdPart(idOrUsername, USERS_TABLE) || userRecordId(idOrUsername)
  const db = await useDb()
  const response = await queryDb(db, 'UPDATE type::record($table, $id) MERGE { password_hash: $passwordHash, updated_at: time::now() };', {
    table: USERS_TABLE,
    id,
    passwordHash
  })

  if (!firstRow<Record<string, unknown>>(response)) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }
}

export async function deleteUser(idOrUsername: string): Promise<void> {
  const id = recordIdPart(idOrUsername, USERS_TABLE) || userRecordId(idOrUsername)
  const db = await useDb()
  await queryDb(db, 'DELETE type::record($table, $id);', {
    table: USERS_TABLE,
    id
  })
}

export async function touchUserLogin(userId: string): Promise<void> {
  const id = recordIdPart(userId, USERS_TABLE)
  if (!id) return

  const db = await useDb()
  await queryDb(db, 'UPDATE type::record($table, $id) MERGE { last_login_at: time::now(), updated_at: time::now() };', {
    table: USERS_TABLE,
    id
  })
}

function stringOrNull(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

function optionalParamExpression(value: unknown, name: string) {
  return value === null || value === undefined || value === '' ? 'NONE' : `$${name}`
}

function normalizeAvatarInput(value: unknown) {
  const avatar = normalizeAvatarRecordId(value, true)

  if (!avatar) {
    return { expression: 'NONE', params: {} }
  }

  return {
    expression: 'type::record($avatarTable, $avatarId)',
    params: {
      avatarTable: 'files',
      avatarId: recordIdPart(avatar, 'files')
    }
  }
}

function normalizeAvatarRecordId(value: unknown, strict: boolean) {
  if (!value) return null

  const recordId = stringifyRecordId(value)
  const id = recordIdPart(recordId, 'files').trim()
  if (!/^[a-f0-9]{64}$/i.test(id)) {
    if (strict) {
      throw createError({ statusCode: 400, message: 'Avatar must reference an existing media record' })
    }
    return null
  }

  return `files:${id.toLowerCase()}`
}

function avatarUrlFromRecordId(value: string) {
  return `/api/media/file/${encodeURIComponent(recordIdPart(value, 'files'))}`
}

function serializeDate(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}