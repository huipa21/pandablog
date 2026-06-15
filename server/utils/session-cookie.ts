import { getCookie, type H3Event } from 'h3'

const AUTH_SESSION_COOKIE_NAME = 'nuxt-session'

export function hasAuthSessionCookie(event: H3Event): boolean {
  return Boolean(getCookie(event, AUTH_SESSION_COOKIE_NAME))
}