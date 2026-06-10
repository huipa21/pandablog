import { DEFAULT_ADMIN_LOCALE, normalizeAdminLocale, type SupportedLocale } from '~/utils/adminLocale'

export const PUBLIC_LOCALE_STORAGE_KEY = 'pb-public-locale'

export function usePublicLocale() {
  const locale = useState<SupportedLocale>('pb-public-locale', () => DEFAULT_ADMIN_LOCALE)
  const initialized = useState('pb-public-locale-initialized', () => false)

  function initPublicLocale() {
    if (initialized.value || !import.meta.client) {
      return locale.value
    }

    locale.value = readStoredLocale() ?? detectBrowserLocale()
    initialized.value = true
    return locale.value
  }

  function setPublicLocale(value: unknown) {
    const normalized = normalizeAdminLocale(value) ?? DEFAULT_ADMIN_LOCALE
    locale.value = normalized

    if (import.meta.client) {
      try {
        localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, normalized)
      } catch {}
    }

    return normalized
  }

  if (import.meta.client) {
    initPublicLocale()
  }

  return {
    locale,
    initPublicLocale,
    setPublicLocale
  }
}

function readStoredLocale() {
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