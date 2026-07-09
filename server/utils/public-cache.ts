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
  // The SSR HTML document bakes in the active theme (stylesheet link +
  // data-theme-variant). If a browser serves a stale copy after a theme change,
  // the stale DOM is hydrated by the current client bundle -> hydration mismatch
  // (doubled header, wrong theme). So the private browser cache must always
  // revalidate the document (max-age=0, must-revalidate, no stale-while-revalidate),
  // while shared caches/CDNs may still serve it for s-maxage to offload the origin.
  return `public, s-maxage=${maxAgeSeconds}, max-age=0, must-revalidate`
}