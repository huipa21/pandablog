import { requireSuperadmin } from '../../../utils/auth'
import { deleteTheme } from '../../../utils/theme-installer'
import { getActiveThemeId, invalidateThemeCache } from '../../../utils/theme-loader'

const BUILT_IN_THEME_IDS = new Set(['default', 'tesla', 'notion', 'clay'])

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing theme id' })

  if (BUILT_IN_THEME_IDS.has(id)) {
    throw createError({ statusCode: 400, message: 'Built-in themes cannot be deleted.' })
  }

  const activeId = await getActiveThemeId()
  if (id === activeId) {
    throw createError({ statusCode: 400, message: 'Cannot delete the active theme. Switch first.' })
  }

  const result = await deleteTheme(id)
  if (!result.ok) {
    throw createError({ statusCode: 400, message: result.error ?? 'Delete failed' })
  }

  invalidateThemeCache(id)
  return { ok: true }
})
