import type { H3Event } from 'h3'
import type { SessionUser } from '../users'
import { accountAllowedInModuleMode, getRequestAuthAccount, getSessionUser } from '../auth'

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
  authEpoch?: string // returned to server callers only; stored in session.secure
}

export interface MfaEnrollState {
  /** Plaintext base32 TOTP secret, only held during the enrollment window. */
  secret: string
  createdAt: string
  authEpoch: string
}

interface PbSession {
  user?: SessionUser
  loggedInAt?: string
  mfaPending?: MfaPendingState
  mfaEnroll?: MfaEnrollState
  secure?: {authEpoch?: string, authenticatedAt?: string}
}

function isFresh(createdAt: unknown): boolean {
  const ts = Date.parse(String(createdAt ?? ''))
  if (Number.isNaN(ts)) {
    return false
  }
  return ts <= Date.now() && Date.now() - ts <= PENDING_TTL_MS
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
  const pending = readPending(session)
  const epoch = session.secure?.authEpoch
  if (!pending || !epoch) return null
  const account = await getRequestAuthAccount(event, pending.userId)
  if (!account?.active || account.auth_epoch !== epoch || !accountAllowedInModuleMode(account)) return null
  return {...pending, authEpoch: epoch}
}

export async function setMfaPending(event: H3Event, userId: string, mode: MfaPendingMode, authEpoch: string): Promise<void> {
  // Replace any prior session so a pending step never coexists with a live
  // authenticated `user` and previous enrollment material is dropped.
  await replaceUserSession(event, {
    secure: {authEpoch},
    mfaPending: { userId, mode, createdAt: new Date().toISOString() }
  })
}

export async function setMfaEnrollSecret(event: H3Event, secret: string, authEpoch: string): Promise<void> {
  await setUserSession(event, {
    mfaEnroll: { secret, authEpoch, createdAt: new Date().toISOString() }
  })
}

export async function getMfaEnrollSecret(event: H3Event): Promise<string | null> {
  const session = (await getUserSession(event)) as PbSession
  // Enrollment can only be read by the current full/pending actor.
  const actor = await resolveMfaActor(event)
  const enroll = readEnroll(session)
  return enroll?.authEpoch === actor.authEpoch ? enroll.secret : null
}

/** Drop any in-progress enrollment material while preserving an existing session. */
export async function clearMfaEnroll(event: H3Event): Promise<void> {
  const session = (await getUserSession(event)) as PbSession
  if (session.user) {
    await replaceUserSession(event, {
      user: session.user,
      secure: session.secure,
      loggedInAt: session.loggedInAt ?? new Date().toISOString()
    })
  } else if (session.mfaPending) {
    await replaceUserSession(event, { mfaPending: session.mfaPending, secure: session.secure })
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
export async function resolveMfaActor(event: H3Event): Promise<{ userId: string, finalize: boolean, authEpoch: string }> {
  const current = await getSessionUser(event)
  if (current) {
    const session = await getUserSession(event)
    return {userId: current.id, finalize: false, authEpoch: (session.secure as {authEpoch: string}).authEpoch}
  }

  const pending = await getMfaPending(event)
  if (pending && pending.mode === 'enroll') {
    return { userId: pending.userId, finalize: true, authEpoch: pending.authEpoch! }
  }

  throw createError({ statusCode: 401, message: 'Authentication required' })
}
