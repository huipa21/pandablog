import { getActiveJob } from '../utils/backups/jobMutex'

/**
 * Fences live traffic while a backup RESTORE is in progress.
 *
 * A restore performs a destructive cutover (wipe the database → import the
 * snapshot → swap media). During that window the live database is empty or only
 * partially populated, so any normal read returns garbage and — worse — any
 * write lands in data that is about to be overwritten and silently lost. To keep
 * the system consistent we return 503 for the duration of the restore.
 *
 * Backup *creation* and *import* only read live data, so they do NOT take the
 * site offline — the gate is restricted to `kind === 'restore'`.
 *
 * NOTE: this reads the in-process job flag, which is correct for the single
 * container / single Nitro process this app is deployed as (`container_name`
 * prevents `--scale`). If ever scaled to multiple replicas, this check would
 * need to consult the shared on-disk lock so every replica fences in lockstep.
 */
const ALLOWED_PREFIXES = [
  '/api/admin/backups', // status polling, restore trigger, list — keeps the admin UI alive
  '/api/auth', // keep the operator's session usable
  '/_nuxt',
  '/__nuxt',
  '/_ipx',
  '/api/_nuxt',
]

const ALLOWED_EXACT = new Set(['/favicon.ico'])

export default defineEventHandler((event) => {
  const job = getActiveJob()
  if (!job || job.kind !== 'restore') return

  const url = getRequestURL(event).pathname

  if (ALLOWED_EXACT.has(url)) return
  for (const prefix of ALLOWED_PREFIXES) {
    if (url === prefix || url.startsWith(prefix + '/') || url.startsWith(prefix + '?')) {
      return
    }
  }

  setResponseHeader(event, 'Retry-After', 15)
  throw createError({
    statusCode: 503,
    statusMessage: 'Service Unavailable',
    message: 'The site is temporarily unavailable while a backup is being restored. Please try again in a moment.',
  })
})
