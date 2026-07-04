import { requireContentManager } from '../../utils/auth'
import { queryDb, useDb } from '../../utils/db'
import { serializeDate } from '../../utils/content'
import { containsEmoji, slugify } from '../../../utils/slug'
import { queryRows } from '../../utils/surrealResult'
import type { MediaTagSummary } from '~/types/content'

export default defineEventHandler(async (event) => {
  await requireContentManager(event)
  const query = getQuery(event)
  const search = typeof query.q === 'string' ? query.q.trim().toLowerCase() : ''
  const db = await useDb()
  const response = await queryDb(db, 'SELECT tags, uploaded_at, created_at FROM files;')
  const counts = new Map<string, MediaTagSummary>()

  for (const file of queryRows<Record<string, unknown>>(response)) {
    const uploadedAt = serializeDate(file.uploaded_at ?? file.created_at)
    const tags = Array.isArray(file.tags) ? file.tags : []

    for (const rawTag of tags) {
      const name = String(rawTag).trim()
      if (!name || (search && !name.toLowerCase().includes(search))) continue

      // Emoji are not allowed in tags; skip names that carry them or that have
      // no usable slug characters so the listing only surfaces valid tags.
      const slug = slugify(name)
      if (!slug || containsEmoji(name)) continue

      const key = name.toLowerCase()
      const existing = counts.get(key)

      if (existing) {
        existing.count += 1
        if (uploadedAt && (!existing.latest_uploaded_at || new Date(uploadedAt).getTime() > new Date(existing.latest_uploaded_at).getTime())) {
          existing.latest_uploaded_at = uploadedAt
        }
      } else {
        counts.set(key, {
          id: key,
          name,
          slug,
          count: 1,
          latest_uploaded_at: uploadedAt
        })
      }
    }
  }

  const tags = Array.from(counts.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return { tags }
})