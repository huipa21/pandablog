export const ADMIN_LOCALE_KEY = 'admin_locale'

export const DEFAULT_ADMIN_LOCALE = 'en'

export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const

export type SupportedLocale = typeof SUPPORTED_LOCALES[number]

export function normalizeAdminLocale(value: unknown): SupportedLocale | null {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale) ? value as SupportedLocale : null
}