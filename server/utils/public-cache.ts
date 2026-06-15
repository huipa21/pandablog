import type { H3Event } from 'h3'
import { hasUnlockedPostCookie } from './post-password'
import { hasAuthSessionCookie } from './session-cookie'
import { getSiteVisibility } from './visibility'

export const PUBLIC_LIST_CACHE_SECONDS = 300
export const PUBLIC_POST_CACHE_SECONDS = 900

export async function shouldBypassPublicCache(event: H3Event): Promise<boolean> {
  if (hasAuthSessionCookie(event) || hasUnlockedPostCookie(event)) {
    return true
  }

  return await getSiteVisibility() !== 'public'
}

export function publicCacheControl(maxAgeSeconds: number) {
  return `public, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 2}`
}