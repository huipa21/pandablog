import { getSessionUser } from '../utils/auth'

/** nuxt-auth-utils /api/_auth/session must not bypass the app resolver. */
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    const user = await getSessionUser(event)
    if (user) session.user = user
    else delete session.user
    // Pending/enrollment secrets are internal, not session API DTOs.
    delete session.mfaEnroll
    delete session.mfaPending
  })
})
