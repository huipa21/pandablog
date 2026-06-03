import type { H3Event } from 'h3'
import { queryDb, useDb } from './db'
import { isAdminAuthenticated } from './auth'
import { readUnlockedIds } from './post-password'
import { firstRow } from './surrealResult'

export type SiteVisibility = 'public' | 'private'
export type PostVisibility = 'public' | 'private' | 'password'

export interface PostAccessInput {
  id: string
  visibility: PostVisibility
}

export type PostAccess =
  | { state: 'allow' }
  | { state: 'not-found' }
  | { state: 'locked', requiresPassword: true }
  | { state: 'site-private' }

export async function getSiteVisibility(): Promise<SiteVisibility> {
  try {
    const db = await useDb()
    const result = await queryDb(db, 'SELECT * FROM app_settings:site_visibility;')

    const setting = firstRow<{ value?: unknown }>(result)
    const value = setting?.value
    return value === 'private' ? 'private' : 'public'
  } catch {
    return 'public'
  }
}

export async function setSiteVisibility(mode: SiteVisibility): Promise<void> {
  if (mode !== 'public' && mode !== 'private') {
    throw createError({ statusCode: 400, message: 'Invalid mode' })
  }

  const db = await useDb()
  await queryDb(
    db,
    `UPSERT app_settings:site_visibility CONTENT {
      key: 'site_visibility',
      value: $mode,
      updated_at: time::now()
    };`,
    { mode }
  )
}

export async function evaluatePostAccess(event: H3Event, post: PostAccessInput): Promise<PostAccess> {
  const isAdmin = await isAdminAuthenticated(event)
  if (isAdmin) return { state: 'allow' }

  const site = await getSiteVisibility()
  if (site === 'private') return { state: 'site-private' }

  if (post.visibility === 'public') return { state: 'allow' }
  if (post.visibility === 'private') return { state: 'not-found' }

  const unlocked = readUnlockedIds(event)
  if (unlocked.has(post.id)) return { state: 'allow' }

  return { state: 'locked', requiresPassword: true }
}

export function sanitizePost<T extends Record<string, unknown>>(post: T): T {
  const { password_hash: _passwordHash, ...rest } = post
  return rest as T
}
