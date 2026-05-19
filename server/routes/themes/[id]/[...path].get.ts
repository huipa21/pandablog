import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { lookup } from 'mrmime'

const THEMES_DIR = 'themes'
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg'])

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const pathParam = getRouterParam(event, 'path')

  if (!id || !pathParam) throw createError({ statusCode: 400 })
  if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(id)) throw createError({ statusCode: 400 })

  // Path safety
  const requested = normalize(pathParam).replace(/\\/g, '/')
  if (requested.includes('..') || requested.startsWith('/')) {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }

  // Only serve image extensions from this route (CSS/JSON go through API)
  const ext = requested.slice(requested.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw createError({ statusCode: 403 })
  }

  const fullPath = join(THEMES_DIR, id, requested)
  if (!existsSync(fullPath)) throw createError({ statusCode: 404 })

  const data = await readFile(fullPath)
  setResponseHeader(event, 'Content-Type', lookup(requested) ?? 'application/octet-stream')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=86400')
  return data
})
