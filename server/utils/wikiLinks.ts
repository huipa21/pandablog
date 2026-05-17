import type { Surreal } from 'surrealdb'
import type { JsonContent } from '~/types/content'
import { slugify } from './content'
import { firstRow, queryRows, recordIdPart, stringifyRecordId } from './surrealResult'

export interface WikiLinkTarget {
  target: string
  label: string
}

export function extractWikiLinks(node: JsonContent | null | undefined): WikiLinkTarget[] {
  const links = new Map<string, WikiLinkTarget>()

  function walk(current: JsonContent | null | undefined) {
    if (!current) {
      return
    }

    if (current.type === 'wikiLink') {
      const label = stringAttr(current.attrs?.label) || stringAttr(current.attrs?.target)
      const target = slugify(stringAttr(current.attrs?.target) || label)

      if (target) {
        links.set(target, {
          target,
          label: label || target
        })
      }
    }

    current.content?.forEach(walk)
  }

  walk(node)
  return [...links.values()]
}

export async function syncPostMentions(db: Surreal, postRecordId: string, content: JsonContent) {
  const postId = recordIdPart(postRecordId, 'post')
  const links = extractWikiLinks(content)

  await db.query('DELETE mentions WHERE in = type::record($postTable, $postId);', {
    postTable: 'post',
    postId
  })

  for (const link of links) {
    const concept = await ensureConcept(db, link)
    const conceptId = recordIdPart(stringifyRecordId(concept.id), 'concept')

    await db.query(
      'RELATE (type::record($postTable, $postId))->mentions->(type::record($conceptTable, $conceptId)) CONTENT { context: $context };',
      {
        postTable: 'post',
        postId,
        conceptTable: 'concept',
        conceptId,
        context: link.label
      }
    )
  }
}

async function ensureConcept(db: Surreal, link: WikiLinkTarget) {
  const existingResponse = await db.query('SELECT * FROM concept WHERE slug = $slug LIMIT 1;', {
    slug: link.target
  })
  const existing = firstRow<Record<string, unknown>>(existingResponse)

  if (existing) {
    return existing
  }

  const createdResponse = await db.query('CREATE concept CONTENT $concept;', {
    concept: {
      name: link.label,
      slug: link.target
    }
  })
  const concept = firstRow<Record<string, unknown>>(createdResponse)

  if (!concept) {
    throw createError({ statusCode: 500, statusMessage: 'Concept was not created' })
  }

  return concept
}

export function normalizeConcept(record: Record<string, unknown>) {
  return {
    id: stringifyRecordId(record.id),
    name: String(record.name ?? ''),
    slug: String(record.slug ?? ''),
    description: record.description === undefined ? null : record.description as string | null
  }
}

export function conceptRows(response: unknown, index = 0) {
  return queryRows<Record<string, unknown>>(response, index).map(normalizeConcept)
}

function stringAttr(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}