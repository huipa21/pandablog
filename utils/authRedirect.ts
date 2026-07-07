export type LoginRedirectRole = 'superadmin' | 'admin' | 'author' | 'viewer'

const ADMIN_DEFAULT_PATH = '/admin/dashboard'
const PUBLIC_DEFAULT_PATH = '/'

export function safeInternalPath(value: unknown, fallback = PUBLIC_DEFAULT_PATH) {
  const raw = String(value ?? '')
  // Same-origin paths only: must start with a single '/', never '//' (protocol
  // relative) or '/\' (backslash trick), to prevent open redirects.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return fallback
  }
  return raw
}

export function resolveLoginRedirect(role: LoginRedirectRole, redirect: unknown) {
  const fallback = role === 'viewer' ? PUBLIC_DEFAULT_PATH : ADMIN_DEFAULT_PATH
  const target = safeInternalPath(redirect, fallback)

  if (role === 'viewer' && target.startsWith('/admin')) {
    return PUBLIC_DEFAULT_PATH
  }

  return target
}