import { queryDb, useDb } from '../../../utils/db'
import { addUnlockedId, fakePostPasswordHash, resolveEffectivePostPasswordHash, verifyPostPassword } from '../../../utils/post-password'
import { checkLoginRateLimit, recordLoginAttempt } from '../../../utils/rate-limit'
import { getRuntimeFlags } from '../../../utils/settings'
import { stringifyRecordId } from '../../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, message: 'Missing slug' })
  }

  const body = await readBody<{ password?: string }>(event)
  const password = body.password ?? ''

  const runtimeFlags = getRuntimeFlags()
  const ip = getRequestIP(event, { xForwardedFor: runtimeFlags.trust_proxy_headers }) ?? null

  const rateKey = ip ? `unlock:${slug}:${ip}` : null
  if (rateKey) {
    const rate = await checkLoginRateLimit(rateKey)
    if (!rate.allowed) {
      setResponseHeader(event, 'Retry-After', rate.retryAfterSec)
      throw createError({
        statusCode: 429,
        message: `Too many attempts. Try again in ${rate.retryAfterSec}s.`
      })
    }
  } else if (runtimeFlags.trust_proxy_headers) {
    throw createError({ statusCode: 400, message: 'Could not resolve client IP' })
  }

  const db = await useDb()
  const response = await queryDb<[Array<{ id: string, visibility?: string, password_hash?: string | null, password_source?: string | null, password_owner?: string | null }>]>(
    db,
    'SELECT id, visibility, password_hash, password_source, password_owner FROM post WHERE slug = $slug AND status = "published" LIMIT 1;',
    { slug }
  )
  const post = response[0]?.[0]

  const effectiveHash = post ? await resolveEffectivePostPasswordHash(post, db) : null
  const hashToCheck = effectiveHash ?? fakePostPasswordHash()
  const passwordOk = await verifyPostPassword(hashToCheck, password)
  const isValid = !!post && post.visibility === 'password' && !!effectiveHash && passwordOk

  if (rateKey) {
    await recordLoginAttempt(rateKey, isValid)
  }

  if (!isValid) {
    throw createError({ statusCode: 401, message: 'Incorrect password' })
  }

  addUnlockedId(event, stringifyRecordId(post.id))
  return { ok: true }
})
