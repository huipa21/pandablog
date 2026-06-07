import { findUserById, toSessionUser, type SessionUser } from '../../utils/users'

/**
 * Source of truth for "is the user logged in" is the signed session cookie.
 * We additionally refresh user data from the DB so role/profile changes are
 * picked up without forcing a re-login, BUT a DB hiccup MUST NOT log the user
 * out — otherwise every transient connection error (cold start, brief socket
 * drop) bounces the browser to /login. We only force a logout when the DB
 * confirms the user is gone or has been deactivated.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const sessionUser = session.user as SessionUser | undefined

  if (!sessionUser?.id) {
    return { loggedIn: false, user: null }
  }

  try {
    const currentUser = await findUserById(sessionUser.id)
    if (currentUser) {
      if (!currentUser.active) {
        return { loggedIn: false, user: null }
      }
      return { loggedIn: true, user: toSessionUser(currentUser) }
    }
    // The DB query succeeded but the user record is gone — log them out.
    return { loggedIn: false, user: null }
  } catch (error) {
    // Transient DB error: trust the signed session cookie and keep the user
    // logged in with cached profile data so we don't bounce them to /login.
    console.warn('[auth.session] user refresh failed; serving cached session user', error)
    return { loggedIn: true, user: sessionUser }
  }
})
