import { queryDb, useDb } from '../utils/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  // The default liveness probe does not touch auth, sessions, settings or DB.
  if (getQuery(event).db === '1') {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        (async () => {
          const db = await useDb()
          await queryDb(db, 'RETURN 1;', undefined, { label: 'health DB probe', timeoutMs: 2000, retryOnReconnect: false })
        })(),
        new Promise<never>((_, reject) => {
          // Bound connection acquisition as well as the query itself.
          timer = setTimeout(() => reject(new Error('DB health probe timed out')), 2000)
        })
      ])
    } catch {
      setResponseStatus(event, 503)
      return { ok: false, db: 'down' }
    } finally {
      clearTimeout(timer)
    }
  }

  return { ok: true, uptime_s: Math.floor(process.uptime()) }
})
