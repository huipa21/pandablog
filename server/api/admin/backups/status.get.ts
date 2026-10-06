import { requireSuperadmin } from '../../../utils/auth'
import { getActiveJob, jobStore } from '../../../utils/backups/jobMutex'
import { writeBarrier } from '../../../utils/maintenance'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const token = getHeader(event, 'X-PandaBlog-Restore-Status') ?? ''
  const capability = jobStore.authorizeStatus(token)
  if (!capability) {
    if (writeBarrier.status().closed) throw createError({statusCode: 403, message: 'Restore status capability required'})
    await requireSuperadmin(event)
  }
  const current = getActiveJob(), journal = jobStore.getJournal()
  const active = capability && current?.token !== journal?.owner.token ? null : current
  // Never serialize owner tokens, artifact paths, hashes or raw recovery errors.
  return {activeJob: active ? {id: active.id, kind: active.kind, startedAt: active.startedAt, progress: active.progress} : null,
    maintenance: writeBarrier.status().closed, recovery_required: writeBarrier.status().recoveryRequired || (writeBarrier.status().closed && jobStore.recoveryRequired()),
    restore_blocked: jobStore.recoveryRequired() || writeBarrier.status().uncertainWrites > 0,
    restore: journal ? {id: journal.owner.id, phase: journal.phase, state: journal.state, updatedAt: journal.updatedAt} : null}
})
