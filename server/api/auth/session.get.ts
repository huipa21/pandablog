import { getSessionUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const user = await getSessionUser(event)
  return {loggedIn: Boolean(user), user}
})
