import { createHmac } from 'node:crypto'
import type { Surreal } from 'surrealdb'
import { queryDb } from './db'
import { queryRows, stringifyRecordId } from './surrealResult'

/**
 * Public author filter support. Authors are exposed by display name only; the
 * id used in URLs is an HMAC of the user record id, so it never reveals the
 * login username (user record ids ARE usernames).
 */

const AUTHOR_TOKEN_LABEL = 'pandablog:search-author:v1'

function authorTokenKey(): Buffer {
  const config = useRuntimeConfig()
  const base = config.session.password as string | undefined
  if (!base) {
    throw new Error('Session password not configured; cannot sign author ids')
  }
  return createHmac('sha256', base).update(AUTHOR_TOKEN_LABEL).digest()
}

export function searchAuthorToken(userId: string): string {
  return createHmac('sha256', authorTokenKey()).update(userId).digest('base64url').slice(0, 16)
}

export interface SearchAuthorRecord {
  /** Opaque token used by the public API. */
  token: string
  name: string
  /** Raw record id value (pass back into queries as-is). */
  recordId: unknown
  username: string
}

/** Users that have a display name, with their opaque tokens. */
export async function loadSearchAuthorRecords(db: Surreal): Promise<SearchAuthorRecord[]> {
  const response = await queryDb(
    db,
    'SELECT id, username, display_name FROM users WHERE display_name != NONE AND display_name != \'\';',
    undefined,
    { label: 'search authors load' }
  )
  return queryRows<{ id?: unknown, username?: unknown, display_name?: unknown }>(response, 0)
    .map((row) => ({
      token: searchAuthorToken(stringifyRecordId(row.id)),
      name: String(row.display_name ?? '').trim(),
      recordId: row.id,
      username: String(row.username ?? '')
    }))
    .filter((author) => author.name && author.username)
}

/** Resolve opaque author tokens to user records (unknown tokens are dropped). */
export async function resolveSearchAuthors(db: Surreal, tokens: string[]): Promise<SearchAuthorRecord[]> {
  if (!tokens.length) return []
  const wanted = new Set(tokens)
  return (await loadSearchAuthorRecords(db)).filter((author) => wanted.has(author.token))
}
