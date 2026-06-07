import { queryDb, useDb } from '../../utils/db'
import { queryRows } from '../../utils/surrealResult'
import { isAdminAuthenticated } from '../../utils/auth'

const WEEKS = 53
const MS_PER_DAY = 24 * 60 * 60 * 1000

interface PublishFrequencyEntry {
  slug: string
  title: string
  published_at: string
}

interface PublishFrequencyResponse {
  posts: PublishFrequencyEntry[]
  range: {
    start: string
    end: string
    weeks: number
  }
}

export default defineEventHandler(async (event): Promise<PublishFrequencyResponse> => {
  const isAdmin = await isAdminAuthenticated(event)
  const visibilityFilter = isAdmin
    ? ''
    : 'AND (visibility IN ["public", "password"] OR visibility IS NONE)'

  const end = new Date()
  const start = new Date(end.getTime() - WEEKS * 7 * MS_PER_DAY)
  const startIso = start.toISOString()
  const endIso = end.toISOString()

  const db = await useDb()
  const response = await queryDb(
    db,
    `SELECT slug, title, published_at
     FROM post
     WHERE status = "published"
       AND published_at != NONE
       AND published_at >= <datetime>$since
       ${visibilityFilter}
     ORDER BY published_at ASC;`,
    { since: startIso }
  )

  const rows = queryRows<Record<string, unknown>>(response, 0)
  const posts = rows
    .map<PublishFrequencyEntry | null>((row) => {
      const published = row.published_at ? String(row.published_at) : ''
      if (!published) return null
      return {
        slug: String(row.slug ?? ''),
        title: String(row.title ?? ''),
        published_at: published
      }
    })
    .filter((entry): entry is PublishFrequencyEntry => entry !== null)

  return {
    posts,
    range: {
      start: startIso,
      end: endIso,
      weeks: WEEKS
    }
  }
})
