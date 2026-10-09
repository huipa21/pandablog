import { lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { inspectRestoreState, readMaintenanceJson } from '../../server/utils/backups/jobMutex'
import { UNCERTAIN_WRITE_QUIESCENCE_MS } from '../../server/utils/maintenance'

export class RecoveryRefusal extends Error {}
export interface RecoveryReport {
  status: 'clear' | 'manual-recovery-required'
  message: string
  canArchiveReviewedStartup: boolean
  blockers: string[]
  findings: string[]
}
export interface RecoveryConfirmations { appStopped: boolean, databaseQuiescent: boolean, dataConsistent: boolean }
async function exists(file: string) {
  try {await lstat(file); return true} catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error}
}
async function directory(file: string) {
  const stat = await lstat(file)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new RecoveryRefusal('Inspection paths must be regular directories, not symbolic links')
}
/** Bounded, restore-oriented inspection. Never loads env, starts Nitro/DB,
 * prints tokens/paths/raw errors, or follows retired writer/guard objects. */
export async function inspectRecovery(storage: string): Promise<RecoveryReport> {
  const root = resolve(storage), backups = join(root, 'backups')
  const blockers: string[] = [], findings: string[] = []
  if (await exists(root)) await directory(root)
  if (await exists(backups)) {
    await directory(backups)
    const state = await inspectRestoreState(backups)
    if (state.recovery) blockers.push('Destructive or ambiguous restore evidence exists. Preserve journal, paired safety and media artifacts; follow docs/maintenance-simplification/operations.md. No automatic rollback is attempted.')
    else if (state.journal) findings.push(state.preDestructive && state.journal.state !== 'aborted'
      ? 'Verified pre-destructive restore preparation is automatically aborted at application preflight. No expert startup recovery is required.'
      : 'Verified terminal restore outcome is informational and does not require archival to start.')
    if (await exists(join(backups, '.writer.lock'))) findings.push('Retired application writer receipt is informational, left untouched and never blocks startup, regardless of its former host/PID or contents.')
    if (await exists(join(backups, '.ownership.guard'))) findings.push('Retired publication guard is left untouched; it is not application startup authority.')
    if (await exists(join(backups, '.job.lock'))) findings.push('Maintenance job ownership is present. Live jobs exclude incompatible jobs; dead local recognized owners can be reclaimed automatically. Unknown, remote, partially published or corrupt nonrestore ownership restricts jobs only. For an offline job-only remedy, stop all app/CLI jobs and preserve the exact job record before operator removal; no database-consistency assertions are required.')
    if (await exists(join(backups, '.uncertain-writes.json'))) {
      try {
        const value = await readMaintenanceJson(join(backups, '.uncertain-writes.json')) as {updatedAt?: unknown}
        const time = typeof value?.updatedAt === 'string' ? Date.parse(value.updatedAt) : Number.NaN
        findings.push(Number.isFinite(time) && time <= Date.now() && time + UNCERTAIN_WRITE_QUIESCENCE_MS <= Date.now()
          ? 'Expired uncertain-write marker is informational; it is not startup authority and remains unchanged.'
          : 'Recent or invalid uncertain-write marker imposes a finite ten-minute job-only hold, not expert recovery or a readiness fence.')
      } catch {findings.push('Unreadable uncertain-write marker imposes a finite ten-minute job-only hold, not expert recovery.')}
    }
  }
  return {status: blockers.length ? 'manual-recovery-required' : 'clear', message: blockers.length
    ? 'Interrupted destructive or ambiguous restore requires offline administrator recovery. No files have been changed.'
    : 'No destructive restore blocker found. Ordinary restart needs no receipt cleanup; correct named initialization/configuration problems using /api/ready and logs.', canArchiveReviewedStartup: false, blockers, findings}
}
/** Compatibility export only: obsolete mutating callers fail before any I/O. */
export async function archiveReviewedStartup(_storage: string, _confirmations: RecoveryConfirmations): Promise<string> {
  throw new RecoveryRefusal('Startup archival is retired. Ordinary restart ignores writer receipts; use panda recover for read-only restore inspection. No files were changed.')
}
