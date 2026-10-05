import type { MediaRecord } from '~/types/content'
import type { SessionUser } from './users'

export function mediaRecordVisibleToUser(file: MediaRecord, user?: SessionUser | null) {
  if (file.visibility === 'public') return true
  if (file.visibility !== 'private') return false

  if (!user) {
    return false
  }

  if (user.role === 'superadmin') {
    return true
  }

  return file.created_by === user.id || file.uploaded_by === user.username
}

export function mediaRecordManageableByUser(file: MediaRecord, user: SessionUser) {
  if (file.visibility !== 'private' && file.visibility !== 'public') return false
  if (user.role === 'superadmin') {
    return true
  }

  if (file.visibility !== 'private' && user.role === 'admin') {
    return true
  }

  return file.created_by === user.id || file.uploaded_by === user.username
}