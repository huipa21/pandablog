import { requireAuthenticatedUser } from '../../utils/auth'
import { queryDb, useDb } from '../../utils/db'
import { mediaReadFileByHash, mediaRecordVisibleToUser } from '../../utils/mediaLibrary'
import { recordIdPart } from '../../utils/surrealResult'
import { findUserById, toSessionUser, updateUser } from '../../utils/users'

export default defineEventHandler(async (event) => {
  const sessionUser = await requireAuthenticatedUser(event)
  const body = await readBody<Record<string, unknown>>(event)
  const existing = await findUserById(sessionUser.id)

  if (!existing || !existing.active) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  const avatar = body.avatar === undefined ? undefined : typeof body.avatar === 'string' ? body.avatar : null
  if (avatar) {
    await assertAvatarMediaSelectable(sessionUser, avatar)
  }

  const user = await updateUser(existing.id, {
    display_name: body.display_name === undefined ? undefined : typeof body.display_name === 'string' ? body.display_name : null,
    email: body.email === undefined ? undefined : typeof body.email === 'string' ? body.email : null,
    avatar
  })

  await setUserSession(event, {
    user: toSessionUser(user),
    loggedInAt: new Date().toISOString()
  })

  return { user }
})

async function assertAvatarMediaSelectable(user: Awaited<ReturnType<typeof requireAuthenticatedUser>>, avatar: string) {
  const hash = recordIdPart(avatar, 'files')
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    throw createError({ statusCode: 400, message: 'Avatar must reference an existing media record' })
  }

  const db = await useDb()
  const file = await mediaReadFileByHash(db, hash)
  if (!file) {
    throw createError({ statusCode: 400, message: 'Avatar media was not found' })
  }
  if (!mediaRecordVisibleToUser(file, user)) {
    throw createError({ statusCode: 403, message: 'You cannot use that media as your avatar' })
  }

  if (file.visibility !== 'public') {
    await queryDb(db, 'UPDATE type::record($table, $id) SET visibility = $visibility, updated_at = time::now();', {
      table: 'files',
      id: hash,
      visibility: 'public'
    })
  }
}