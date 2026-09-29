import { DEFAULT_ADMIN_LOCALE, normalizeAdminLocale, type SupportedLocale } from '~/utils/adminLocale'

/**
 * Public-site language. The cookie is the single source of truth so the server
 * renders the same language the browser hydrates with (no hydration mismatch,
 * no flash on reload):
 *
 *   cookie present  -> server + client render that language
 *   no cookie       -> server + client render the default (en); after mount the
 *                      browser adopts the legacy localStorage choice or the
 *                      browser language once and stores it in the cookie
 *
 * The admin panel language is separate (admin setting, see layouts/admin.vue).
 */
export const PUBLIC_LOCALE_COOKIE = 'pb-public-locale'
/** Pre-cookie storage key; read once for migration, then removed. */
export const PUBLIC_LOCALE_STORAGE_KEY = 'pb-public-locale'

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function usePublicLocale() {
  const cookie = useCookie<string | null>(PUBLIC_LOCALE_COOKIE, {
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    default: () => null
  })
  const locale = useState<SupportedLocale>('pb-public-locale', () => normalizeAdminLocale(cookie.value) ?? DEFAULT_ADMIN_LOCALE)
  const initialized = useState('pb-public-locale-initialized', () => false)

  /**
   * Client only, after hydration: on a first visit (no cookie) pick the legacy
   * stored choice or the browser language and persist it. Returns the locale.
   */
  function initPublicLocale() {
    if (initialized.value || !import.meta.client) {
      return locale.value
    }
    initialized.value = true

    if (!normalizeAdminLocale(cookie.value)) {
      persist(readLegacyStoredLocale() ?? detectBrowserLocale())
    }
    return locale.value
  }

  function setPublicLocale(value: unknown) {
    const normalized = normalizeAdminLocale(value) ?? DEFAULT_ADMIN_LOCALE
    persist(normalized)
    return normalized
  }

  function persist(value: SupportedLocale) {
    locale.value = value
    cookie.value = value
    if (import.meta.client) {
      try {
        localStorage.removeItem(PUBLIC_LOCALE_STORAGE_KEY)
      } catch {}
    }
  }

  return {
    locale,
    initPublicLocale,
    setPublicLocale
  }
}

function readLegacyStoredLocale() {
  try {
    return normalizeAdminLocale(localStorage.getItem(PUBLIC_LOCALE_STORAGE_KEY))
  } catch {
    return null
  }
}

function detectBrowserLocale(): SupportedLocale {
  const browserLocale = navigator.language || navigator.languages?.[0] || ''
  return browserLocale.toLowerCase().startsWith('zh') ? 'zh-CN' : DEFAULT_ADMIN_LOCALE
}
