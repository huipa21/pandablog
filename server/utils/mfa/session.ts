import type { H3Event } from 'h3'
import type { SessionUser } from '../users'

// The pending MFA states live in the same sealed, httpOnly session cookie used
// for authenticated sessions. They are short lived (5 minutes) and never grant
// access on their own — a full `user` session is only issued after the second
// factor (or enrollment) succeeds.
const PENDING_TTL_MS = 5 * 60 * 1000

export type MfaPendingMode = 'verify' | 'enroll'

export interface MfaPendingState {
  userId: string
  mode: MfaPendingMode
  createdAt: string
}

export interface MfaEnrollState {
  /** Plaintext base32 TOTP secret, only held during the enrollment window. */
  secret: string
  createdAt: string
}

interface PbSession {
  user?: SessionUser
  loggedInAt?: string
  mfaPending?: MfaPendingState
  mfaEnroll?: MfaEnrollState
}

function isFresh(createdAt: unknown): boolean {
  const ts = Date.parse(String(createdAt ?? ''))
  if (Number.isNaN(ts)) {
    return false
  }
  return Date.now() - ts <= PENDING_TTL_MS
}

function readPending(session: PbSession): MfaPendingState | null {
  const pending = session.mfaPending
  if (!pending || !pending.userId || !isFresh(pending.createdAt)) {
    return null
  }
  if (pending.mode !== 'verify' && pending.mode !== 'enroll') {
    return null
  }
  return pending
}

function readEnroll(session: PbSession): MfaEnrollState | null {
  const enroll = session.mfaEnroll
  if (!enroll || typeof enroll.secret !== 'string' || !enroll.secret || !isFresh(enroll.createdAt)) {
    return null
  }
  return enroll
}

export async function getMfaPending(event: H3Event): Promise<MfaPendingState | null> {
  const session = (await getUserSession(event)) as PbSession
  return readPending(session)
}

export async function setMfaPending(event: H3Event, userId: string, mode: MfaPendingMode): Promise<void> {
  // Replace any prior session so a pending step never coexists with a live
  // authenticated `user` and previous enrollment material is dropped.
  await replaceUserSession(event, {
    mfaPending: { userId, mode, createdAt: new Date().toISOString() }
  })
}

export async function setMfaEnrollSecret(event: H3Event, secret: string): Promise<void> {
  await setUserSession(event, {
    mfaEnroll: { secret, createdAt: new Date().toISOString() }
  })
}

export async function getMfaEnrollSecret(event: H3Event): Promise<string | null> {
  const session = (await getUserSession(event)) as PbSession
  return readEnroll(session)?.secret ?? null
}

/** Drop any in-progress enrollment material while preserving an existing session. */
export async function clearMfaEnroll(event: H3Event): Promise<void> {
  const session = (await getUserSession(event)) as PbSession
  if (session.user) {
    await replaceUserSession(event, {
      user: session.user,
      loggedInAt: session.loggedInAt ?? new Date().toISOString()
    })
  } else if (session.mfaPending) {
    await replaceUserSession(event, { mfaPending: session.mfaPending })
  } else {
    await clearUserSession(event)
  }
}

/**
 * Identify who an enrollment request belongs to. Accepts either:
 *  - a fully authenticated session (self-service enrollment), or
 *  - a short-lived `enroll`-mode pending session created by enforcement.
 *
 * `finalize` is true when the caller must issue a full login session on
 * successful activation (forced enrollment has no prior session).
 */
export async function resolveMfaActor(event: H3Event): Promise<{ userId: string, finalize: boolean }> {
  const session = (await getUserSession(event)) as PbSession
  if (session.user?.id) {
    return { userId: session.user.id, finalize: false }
  }

  const pending = readPending(session)
  if (pending && pending.mode === 'enroll') {
    return { userId: pending.userId, finalize: true }
  }

  throw createError({ statusCode: 401, message: 'Authentication required' })
}
