/** Access-log prefix exclusions shared by server defaults and the admin form. */
export const DEFAULT_LOGGING_EXCLUDED_PATHS = [
  '/_nuxt',
  '/favicon',
  '/api/admin/logs',
  '/api/health',
  '/api/analytics/track',
  '/__nuxt_error',
  '/_i18n'
] as const

/** Parse the admin form's comma/whitespace-separated statuses without inventing 0 for empty text. */
export function parseExcludedStatusCodes(value: string): number[] {
  return value.split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isInteger)
}
