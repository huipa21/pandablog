import { setResponseHeader } from 'h3'
import { passwordAdmission } from '../utils/admission'
import { rateLimiter } from '../utils/rate-limit'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    const failure = error as { statusCode?: number, data?: {retryAfterSec?: number} }
    if (event && (failure.statusCode === 429 || failure.statusCode === 503) && failure.data?.retryAfterSec) {
      setResponseHeader(event, 'Retry-After', failure.data.retryAfterSec)
    }
  })
  nitroApp.hooks.hook('close', async () => {
    rateLimiter.shutdown()
    if (!await passwordAdmission.shutdown()) console.warn('[password-work] native operations still draining; no slot was released early')
  })
})
