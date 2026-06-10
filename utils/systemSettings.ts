export const ADMIN_DATE_FORMAT_KEY = 'admin_date_format'
export const ADMIN_TIMEZONE_KEY = 'admin_timezone'
export const ADMIN_FORMAT_LOCALE_KEY = 'admin_format_locale'

export const DEFAULT_ADMIN_DATE_FORMAT = 'iso-8601'
export const DEFAULT_ADMIN_TIMEZONE = 'UTC'
export const DEFAULT_ADMIN_FORMAT_LOCALE = 'en-US'

export const ADMIN_DATE_FORMATS = [
  'iso-8601',
  'yyyy-slash',
  'mdy-slash',
  'dmy-slash',
  'short-month',
  'long-month',
  'long-month-ordinal'
] as const

const LEGACY_ADMIN_DATE_FORMATS: Record<string, AdminDateFormat> = {
  short: 'mdy-slash',
  medium: 'short-month',
  long: 'long-month',
  full: 'long-month'
}

const FALLBACK_ADMIN_TIMEZONES = [
  'UTC',
  'Africa/Cairo',
  'Africa/Casablanca',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Caracas',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Phoenix',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Toronto',
  'Asia/Bangkok',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Kolkata',
  'Asia/Manila',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Paris',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Pacific/Auckland',
  'Pacific/Honolulu',
  'Australia/Sydney'
] as const

export const ADMIN_FORMAT_LOCALES = [
  'af-ZA',
  'am-ET',
  'ar-AE',
  'ar-EG',
  'ar-MA',
  'ar-SA',
  'az-Latn-AZ',
  'be-BY',
  'bg-BG',
  'bn-BD',
  'bn-IN',
  'bs-Latn-BA',
  'ca-ES',
  'cs-CZ',
  'cy-GB',
  'da-DK',
  'de-AT',
  'de-CH',
  'de-DE',
  'el-GR',
  'en-AU',
  'en-CA',
  'en-GB',
  'en-IN',
  'en-NZ',
  'en-SG',
  'en-US',
  'en-ZA',
  'es-AR',
  'es-CL',
  'es-CO',
  'es-ES',
  'es-MX',
  'es-PE',
  'es-US',
  'et-EE',
  'eu-ES',
  'fa-IR',
  'fi-FI',
  'fil-PH',
  'fr-BE',
  'fr-CA',
  'fr-CH',
  'fr-FR',
  'gl-ES',
  'gu-IN',
  'he-IL',
  'hi-IN',
  'hr-HR',
  'hu-HU',
  'id-ID',
  'is-IS',
  'it-CH',
  'it-IT',
  'ja-JP',
  'ka-GE',
  'kk-KZ',
  'km-KH',
  'kn-IN',
  'ko-KR',
  'lo-LA',
  'lt-LT',
  'lv-LV',
  'mk-MK',
  'ml-IN',
  'mr-IN',
  'ms-MY',
  'my-MM',
  'nb-NO',
  'ne-NP',
  'nl-BE',
  'nl-NL',
  'pa-IN',
  'pl-PL',
  'pt-BR',
  'pt-PT',
  'ro-RO',
  'ru-RU',
  'si-LK',
  'sk-SK',
  'sl-SI',
  'sq-AL',
  'sr-Cyrl-RS',
  'sr-Latn-RS',
  'sv-SE',
  'sw-KE',
  'ta-IN',
  'te-IN',
  'th-TH',
  'tr-TR',
  'uk-UA',
  'ur-PK',
  'uz-Latn-UZ',
  'vi-VN',
  'yue-Hant-HK',
  'zh-CN',
  'zh-HK',
  'zh-TW'
] as const

export type AdminDateFormat = typeof ADMIN_DATE_FORMATS[number]
export type AdminTimezone = string
export type AdminFormatLocale = string

interface SelectOption {
  label: string
  value: string
}

export function normalizeAdminDateFormat(value: unknown): AdminDateFormat | null {
  if (typeof value !== 'string') {
    return null
  }

  return ADMIN_DATE_FORMATS.includes(value as AdminDateFormat) ? value as AdminDateFormat : LEGACY_ADMIN_DATE_FORMATS[value] ?? null
}

export function normalizeAdminTimezone(value: unknown): AdminTimezone | null {
  if (typeof value !== 'string') {
    return null
  }

  const timezone = value.trim()
  return supportedTimezoneSet().has(timezone) ? timezone : null
}

export function normalizeAdminFormatLocale(value: unknown): AdminFormatLocale | null {
  if (typeof value !== 'string') {
    return null
  }

  const locale = canonicalLocale(value)
  if (!locale) {
    return null
  }

  return Intl.DateTimeFormat.supportedLocalesOf([locale]).length ? locale : null
}

export function getAdminTimezoneOptions(referenceDate = new Date()): SelectOption[] {
  return supportedTimezones()
    .map((timezone) => ({
      label: formatTimezoneLabel(timezone, referenceDate),
      value: timezone
    }))
    .sort((first, second) => {
      const firstOffset = timezoneOffsetMinutes(first.value, referenceDate)
      const secondOffset = timezoneOffsetMinutes(second.value, referenceDate)
      return firstOffset - secondOffset || first.label.localeCompare(second.label)
    })
}

export function getAdminFormatLocaleOptions(displayLocale = DEFAULT_ADMIN_FORMAT_LOCALE): SelectOption[] {
  return supportedFormatLocales()
    .map((locale) => ({
      label: formatLocaleLabel(locale, displayLocale),
      value: locale
    }))
    .sort((first, second) => first.label.localeCompare(second.label))
}

function supportedTimezoneSet() {
  return new Set(supportedTimezones())
}

function supportedTimezones() {
  const intlWithSupportedValues = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  const timezones = intlWithSupportedValues.supportedValuesOf?.('timeZone') ?? []
  return Array.from(new Set(['UTC', ...timezones, ...FALLBACK_ADMIN_TIMEZONES]))
}

function supportedFormatLocales() {
  return Intl.DateTimeFormat.supportedLocalesOf(ADMIN_FORMAT_LOCALES)
}

function formatTimezoneLabel(timezone: string, referenceDate: Date) {
  return `(${formatUtcOffset(timezoneOffsetMinutes(timezone, referenceDate))}) ${timezoneCityName(timezone)} - ${timezone}`
}

function timezoneCityName(timezone: string) {
  if (timezone === 'UTC') {
    return 'UTC'
  }

  const parts = timezone.split('/')
  return (parts.at(-1) ?? timezone).replaceAll('_', ' ')
}

function timezoneOffsetMinutes(timezone: string, referenceDate: Date) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
      hour: '2-digit'
    }).formatToParts(referenceDate)
    const timezoneName = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT'
    const match = /^GMT(?:(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?)?$/.exec(timezoneName)
    if (!match?.groups?.sign) {
      return 0
    }

    const direction = match.groups.sign === '-' ? -1 : 1
    const hours = Number(match.groups.hours ?? 0)
    const minutes = Number(match.groups.minutes ?? 0)
    return direction * (hours * 60 + minutes)
  } catch {
    return 0
  }
}

function formatUtcOffset(totalMinutes: number) {
  const sign = totalMinutes < 0 ? '-' : '+'
  const absoluteMinutes = Math.abs(totalMinutes)
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0')
  const minutes = String(absoluteMinutes % 60).padStart(2, '0')
  return `UTC${sign}${hours}:${minutes}`
}

function canonicalLocale(value: string) {
  try {
    return Intl.getCanonicalLocales(value.trim().replaceAll('_', '-'))[0] ?? null
  } catch {
    return null
  }
}

function formatLocaleLabel(locale: string, displayLocale: string) {
  const displayNamesConstructor = (Intl as typeof Intl & {
    DisplayNames?: new (locales?: string | string[], options?: { type: string }) => { of: (code: string) => string | undefined }
  }).DisplayNames
  const displayName = displayNamesConstructor
    ? new displayNamesConstructor([displayLocale], { type: 'language' }).of(locale)
    : null

  return `${displayName ?? locale} - ${locale}`
}