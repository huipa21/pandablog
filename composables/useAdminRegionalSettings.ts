import {
  ADMIN_DATE_FORMAT_KEY,
  ADMIN_FORMAT_LOCALE_KEY,
  ADMIN_TIMEZONE_KEY,
  DEFAULT_ADMIN_DATE_FORMAT,
  DEFAULT_ADMIN_FORMAT_LOCALE,
  DEFAULT_ADMIN_TIMEZONE,
  normalizeAdminDateFormat,
  normalizeAdminFormatLocale,
  normalizeAdminTimezone
} from '~/utils/systemSettings'

interface AdminLayoutSettingsData {
  settings: Record<string, unknown>
}

export function useAdminRegionalSettings() {
  const { data: adminSettings } = useNuxtData<AdminLayoutSettingsData>('admin-layout-settings')
  const settings = computed(() => adminSettings.value?.settings ?? {})
  const dateFormat = computed(() => normalizeAdminDateFormat(settings.value[ADMIN_DATE_FORMAT_KEY]) ?? DEFAULT_ADMIN_DATE_FORMAT)
  const timezone = computed(() => normalizeAdminTimezone(settings.value[ADMIN_TIMEZONE_KEY]) ?? DEFAULT_ADMIN_TIMEZONE)
  const formatLocale = computed(() => normalizeAdminFormatLocale(settings.value[ADMIN_FORMAT_LOCALE_KEY]) ?? DEFAULT_ADMIN_FORMAT_LOCALE)

  function formatAdminDate(value: string | number | Date | null | undefined, fallback = '') {
    if (!value) {
      return fallback
    }

    return formatDateWithPattern(toDate(value), dateFormat.value, formatLocale.value, timezone.value)
  }

  function formatAdminDateTime(value: string | number | Date | null | undefined, fallback = '') {
    if (!value) {
      return fallback
    }

    const date = toDate(value)
    return `${formatDateWithPattern(date, dateFormat.value, formatLocale.value, timezone.value)} ${formatTimeValue(date, formatLocale.value, timezone.value)}`
  }

  function formatAdminTime(value: string | number | Date | null | undefined, fallback = '') {
    if (!value) {
      return fallback
    }

    return formatTimeValue(toDate(value), formatLocale.value, timezone.value)
  }

  function formatAdminNumber(value: number) {
    return new Intl.NumberFormat(formatLocale.value).format(value)
  }

  return {
    dateFormat,
    timezone,
    formatLocale,
    formatAdminDate,
    formatAdminDateTime,
    formatAdminTime,
    formatAdminNumber
  }
}

function toDate(value: string | number | Date) {
  return value instanceof Date ? value : new Date(value)
}

function formatDateWithPattern(date: Date, pattern: string, locale: string, timezone: string) {
  const parts = dateParts(date, timezone)

  if (pattern === 'iso-8601') {
    return `${parts.year}-${parts.month}-${parts.day}`
  }

  if (pattern === 'yyyy-slash') {
    return `${parts.year}/${parts.month}/${parts.day}`
  }

  if (pattern === 'mdy-slash') {
    return `${parts.month}/${parts.day}/${parts.year}`
  }

  if (pattern === 'dmy-slash') {
    return `${parts.day}/${parts.month}/${parts.year}`
  }

  if (pattern === 'long-month-ordinal' && locale.toLowerCase().startsWith('en')) {
    const month = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: timezone }).format(date)
    return `${month} ${ordinalNumber(Number(parts.day))}, ${parts.year}`
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: pattern === 'long-month' || pattern === 'long-month-ordinal' ? 'long' : 'short',
    day: 'numeric',
    timeZone: timezone
  }).format(date)
}

function formatTimeValue(date: Date, locale: string, timezone: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone
  }).format(date)
}

function dateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone
  }).formatToParts(date)

  return {
    year: parts.find((part) => part.type === 'year')?.value ?? '0000',
    month: parts.find((part) => part.type === 'month')?.value ?? '01',
    day: parts.find((part) => part.type === 'day')?.value ?? '01'
  }
}

function ordinalNumber(value: number) {
  const remainder = value % 100
  if (remainder >= 11 && remainder <= 13) {
    return `${value}th`
  }

  if (value % 10 === 1) return `${value}st`
  if (value % 10 === 2) return `${value}nd`
  if (value % 10 === 3) return `${value}rd`
  return `${value}th`
}