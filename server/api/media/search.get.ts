import { requireContentManager } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { mediaSearchFileRecords } from '../../utils/mediaLibrary'
import type { MediaAdvancedGroup } from '../../utils/mediaLibrary'

export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)
  const query = getQuery(event)
  const db = await useDb()
  const searchRegex = query.search_regex === 'true'
  const caseInsensitive = query.case_insensitive !== 'false'
  const filenameRegex = safeRegexQuery(query.filename_regex)
  const filenameRegexCaseInsensitive = query.filename_regex_case_insensitive !== 'false'
  const safeSearch = searchRegex ? safeRegexQuery(query.search) : stringQuery(query.search)

  return await mediaSearchFileRecords(db, {
    page: Number(query.page || 1),
    limit: Number(query.limit || 24),
    search: safeSearch,
    file_name: searchTextQuery(query.file_name),
    extension: searchTextQuery(query.extension),
    comment: searchTextQuery(query.comment),
    tags: tagsQuery(query.tags),
    tag_relation: tagRelationQuery(query.tag_relation),
    filename_regex: filenameRegex,
    filename_regex_case_insensitive: filenameRegexCaseInsensitive,
    search_regex: searchRegex,
    case_insensitive: caseInsensitive,
    sort: stringQuery(query.sort),
    advanced: advancedQuery(query.advanced),
    type: stringQuery(query.type) || 'all',
    mime_type: stringQuery(query.mime_type),
    folder: stringQuery(query.folder),
    tag: stringQuery(query.tag),
    uploaded_from: stringQuery(query.uploaded_from),
    uploaded_to: stringQuery(query.uploaded_to),
    orphan: query.orphan === 'true',
    visibility: stringQuery(query.visibility),
    visibleToUser: user
  })
})

function stringQuery(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function safeRegexQuery(value: unknown) {
  const raw = stringQuery(value).trim()
  if (!raw) return ''
  if (raw.length > 200) return ''

  try {
    // Validate only; actual matching is performed in DB query.
    new RegExp(raw)
    return raw
  } catch {
    return ''
  }
}

function searchTextQuery(value: unknown) {
  return stringQuery(value).trim().slice(0, 500)
}

function tagsQuery(value: unknown) {
  const raw = stringQuery(value).trim()
  if (!raw) return []

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 20)
      }
    } catch {
      return []
    }
  }

  return raw.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 20)
}

function tagRelationQuery(value: unknown) {
  return stringQuery(value).toLowerCase() === 'or' ? 'or' : 'and'
}

function advancedQuery(value: unknown): MediaAdvancedGroup | null {
  const raw = stringQuery(value).trim()
  if (!raw || raw.length > 6000) return null

  try {
    const parsed = JSON.parse(raw) as { op?: unknown, conditions?: unknown }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.conditions)) return null
    return parsed as MediaAdvancedGroup
  } catch {
    return null
  }
}
