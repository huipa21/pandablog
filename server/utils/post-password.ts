import argon2 from 'argon2'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import type { Surreal } from 'surrealdb'
import { queryDbRecord } from './db'
import { getRuntimeFlags } from './settings'
import { recordIdPart, stringifyRecordId } from './surrealResult'

const COOKIE_NAME = 'pb_unlocked'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const HMAC_LABEL = 'pandablog:post-unlock:v1'
const FAKE_HASH = '$argon2id$v=19$m=65536,t=3,p=4$24FJyhtv+GvZe+OBX7WhuA$izl1gAgSi6XFKd07Qd9tXjyULm7rMyxhhPkl5TMuh8U'

interface UnlockedPayload {
  ids: string[]
  iat: number
}

function hmacKey(): Buffer {
  const config = useRuntimeConfig()
  const base = config.session.password as string | undefined
  if (!base) {
    throw new Error('Session password not configured; cannot sign post-unlock cookie')
  }
  return createHmac('sha256', base).update(HMAC_LABEL).digest()
}

function sign(payload: UnlockedPayload): string {
  const json = JSON.stringify(payload)
  const body = Buffer.from(json, 'utf8').toString('base64url')
  const sig = createHmac('sha256', hmacKey()).update(body).digest('base64url')
  return `${body}.${sig}`
}

function verify(value: string): UnlockedPayload | null {
  const dot = value.indexOf('.')
  if (dot < 0) return null

  const body = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = createHmac('sha256', hmacKey()).update(body).digest('base64url')

  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const json = Buffer.from(body, 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as UnlockedPayload
    if (!Array.isArray(parsed.ids)) return null
    if (typeof parsed.iat !== 'number') return null

    const ageSec = Math.floor(Date.now() / 1000) - parsed.iat
    if (ageSec > COOKIE_MAX_AGE) return null

    return parsed
  } catch {
    return null
  }
}

export function readUnlockedIds(event: H3Event): Set<string> {
  const raw = getCookie(event, COOKIE_NAME)
  if (!raw) return new Set()
  const payload = verify(raw)
  return new Set(payload?.ids ?? [])
}

export function addUnlockedId(event: H3Event, postId: string): void {
  const current = readUnlockedIds(event)
  current.add(postId)

  const payload: UnlockedPayload = {
    ids: Array.from(current).slice(-100),
    iat: Math.floor(Date.now() / 1000)
  }

  setCookie(event, COOKIE_NAME, sign(payload), {
    httpOnly: true,
    sameSite: 'lax',
    secure: getRuntimeFlags().trust_proxy_headers,
    maxAge: COOKIE_MAX_AGE,
    path: '/'
  })
}

export async function hashPostPassword(plain: string): Promise<string> {
  if (typeof plain !== 'string' || plain.length < 4) {
    throw createError({ statusCode: 400, message: 'Password must be at least 4 characters' })
  }

  if (plain.length > 200) {
    throw createError({ statusCode: 400, message: 'Password too long' })
  }

  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 4
  })
}

export async function verifyPostPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    return false
  }
}

export function fakePostPasswordHash(): string {
  return FAKE_HASH
}

/**
 * Returns the password hash that should be used to verify access to a
 * password-protected post. If the post is configured to use the linked
 * owner's login password (`password_source === 'user'`), the owner's
 * `password_hash` is fetched live. Otherwise the post's own stored
 * `password_hash` is returned. Returns `null` when no hash is available.
 */
export async function resolveEffectivePostPasswordHash(
  post: Record<string, unknown>,
  db: Surreal
): Promise<string | null> {
  const source = typeof post.password_source === 'string' ? post.password_source : 'custom'

  if (source === 'user') {
    const ownerRaw = post.password_owner
    if (!ownerRaw) {
      return null
    }

    const ownerId = recordIdPart(stringifyRecordId(ownerRaw), 'users')
    if (!ownerId) {
      return null
    }

    const owner = await queryDbRecord(db, 'users', ownerId)
    if (!owner) {
      return null
    }

    const hash = typeof owner.password_hash === 'string' ? owner.password_hash : ''
    return hash.length > 0 ? hash : null
  }

  const hash = typeof post.password_hash === 'string' ? post.password_hash : ''
  return hash.length > 0 ? hash : null
}
