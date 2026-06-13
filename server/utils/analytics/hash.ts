import { createHash } from 'node:crypto'
import { getAnalyticsHashSalt } from '../settings'

export async function hashAnalyticsVisitor(ip: string, userAgent: string) {
  const salt = await getAnalyticsHashSalt()
  return createHash('sha256')
    .update(salt)
    .update('\0')
    .update(ip)
    .update('\0')
    .update(userAgent)
    .digest('hex')
}
