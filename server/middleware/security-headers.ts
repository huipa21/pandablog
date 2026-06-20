/**
 * Baseline security response headers applied to every response.
 *
 * - Content-Security-Policy: defense-in-depth against XSS/clickjacking. Inline
 *   scripts/styles are still allowed because Nuxt injects an inline theme-init
 *   script and scoped/utility styles; a future hardening step can move to a
 *   nonce-based policy. `object-src 'none'`, `base-uri`, `frame-ancestors` and
 *   `form-action` are locked down regardless.
 * - X-Content-Type-Options: nosniff stops MIME sniffing (also protects media).
 * - X-Frame-Options / frame-ancestors: clickjacking protection.
 * - Strict-Transport-Security: only in production (TLS terminated at the proxy).
 */
const isProd = process.env.NODE_ENV === 'production'

const scriptSrc = ["'self'", "'unsafe-inline'"]
const connectSrc = ["'self'"]

if (!isProd) {
  // Vite dev server / HMR needs eval and websocket connections.
  scriptSrc.push("'unsafe-eval'")
  connectSrc.push('ws:', 'wss:')
}

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  `script-src ${scriptSrc.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc.join(' ')}`,
  "media-src 'self' blob: https:",
  // YouTube embeds (video block) plus same-origin sandboxed custom-html iframes.
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  "worker-src 'self' blob:"
].join('; ')

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Content-Security-Policy', CSP)
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'X-Frame-Options', 'SAMEORIGIN')
  setResponseHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin')
  setResponseHeader(event, 'Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()')

  if (isProd) {
    setResponseHeader(event, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
})
