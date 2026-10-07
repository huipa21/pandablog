import { randomBytes } from 'node:crypto'
import { lstat, mkdir, open, opendir, readFile, rename, rm } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join, resolve } from 'node:path'
import { syncDirectory, writeDurableJson } from '../../server/utils/backups/jobMutex'

export class RecoveryRefusal extends Error {}
interface Owner { token: string, generation: string, host: string, pid: number }
interface Evidence { writer?: Owner, writerBytes?: string, emptyWriter?: boolean, uncertainBytes?: string }
export interface RecoveryReport {
  status: 'clear' | 'writer-active' | 'review-required' | 'manual-recovery-required'
  message: string
  canArchiveReviewedStartup: boolean
  blockers: string[]
  findings: string[]
}
export interface RecoveryConfirmations { appStopped: boolean, databaseQuiescent: boolean, dataConsistent: boolean }
const absent = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
const regularDirectory = async (path: string) => {
  const stat = await lstat(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new RecoveryRefusal('Recovery paths must be regular directories, not symbolic links')
}
async function exists(path: string) {
  try {await lstat(path); return true} catch (error) {if (absent(error)) return false; throw error}
}
async function record(path: string) {
  const stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw new Error('Unsafe recovery record')
  const file = await open(path, 'r')
  try {
    const bytes = Buffer.alloc(64 * 1024 + 1)
    const {bytesRead} = await file.read(bytes, 0, bytes.length, 0)
    if (bytesRead > 64 * 1024) throw new Error('Oversized recovery record')
    const raw = bytes.subarray(0, bytesRead).toString('utf8')
    return {raw, value: JSON.parse(raw) as unknown}
  } finally {await file.close()}
}
function owner(value: unknown): value is Owner {
  const v = value as Owner | undefined
  return Boolean(v && /^[a-f0-9]{48}$/.test(v.token) && /^[a-f0-9]{48}$/.test(v.generation) && typeof v.host === 'string' && Number.isInteger(v.pid) && v.pid > 0 && !('job' in v))
}
function localProcessState(value: Owner): 'live' | 'dead' | 'unknown' {
  try {process.kill(value.pid, 0); return 'live'} catch (error) {return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'dead' : 'unknown'}
}

/** No environment/config loading, database connection or SQL. Marker presence
 * is not proof of corruption; missing journals are not proof of consistency. */
async function inspect(storage: string, ownGuard = false): Promise<{report: RecoveryReport, evidence: Evidence}> {
  const root = resolve(storage), backups = join(root, 'backups')
  const blockers: string[] = [], findings: string[] = [], evidence: Evidence = {}
  let liveWriter = false
  if (!await exists(backups)) return {report: {status: 'clear', message: 'No backup recovery records found. Check /api/ready for configuration errors.', canArchiveReviewedStartup: false, blockers, findings}, evidence}
  await regularDirectory(root); await regularDirectory(backups)
  if (!ownGuard && await exists(join(backups, '.ownership.guard'))) blockers.push('An ownership publication guard exists. It cannot be taken over automatically.')
  if (await exists(join(backups, '.restore-journal.json'))) blockers.push('A restore journal exists. This assistant does not resume or roll back restores; preserve the journal and its artifacts.')
  if (await exists(join(backups, '.job.lock'))) blockers.push('Maintenance job ownership exists. This is not a startup-only recovery.')
  const entries = await opendir(backups)
  let count = 0
  for await (const entry of entries) {
    if (++count > 512) {blockers.push('Backup directory inspection limit exceeded. Manual inspection is required.'); break}
    if (entry.name.startsWith('.restore-') && entry.name !== '.restore-journal.json') blockers.push('Restore safety/staging artifacts exist. This assistant will not alter them.')
  }
  if (await exists(join(backups, '.writer.lock'))) {
    try {
      const directory = join(backups, '.writer.lock')
      await regularDirectory(directory)
      const children = await opendir(directory)
      let hasOwner = false
      for await (const entry of children) {
        if (entry.name !== 'owner.json') throw new Error('Unexpected ownership artifacts')
        hasOwner = true
      }
      if (!hasOwner) {
        // No receipt exists to validate/probe. This is NOT evidence of a dead
        // writer; only explicit external review can authorize archival. Any
        // partially published nonempty directory remains a refusal.
        evidence.emptyWriter = true
        findings.push('The .writer.lock directory is empty: owner.json is missing. Its former host, process and generation cannot be determined. Archive only after independently verifying all recovery prerequisites.')
      } else {
        const current = await record(join(directory, 'owner.json'))
        if (!owner(current.value)) throw new Error('Invalid writer ownership')
        evidence.writer = current.value; evidence.writerBytes = current.raw
        if (current.value.host !== hostname()) blockers.push('Writer ownership belongs to another host. Inspect it on that host.')
        else {
          const state = localProcessState(current.value)
          if (state === 'live') {
            liveWriter = true
            findings.push('The recorded writer process is running. An active writer lock is normal and must not be archived.')
          } else if (state === 'unknown') blockers.push('Writer process state could not be checked. Its ownership must not be archived automatically.')
          else findings.push('A dead local writer receipt is present. A dead PID alone does not prove database execution stopped.')
        }
      }
    } catch {blockers.push('Writer ownership is unreadable, malformed or contains unexpected artifacts. It will not be archived automatically.')}
  }
  if (await exists(join(backups, '.uncertain-writes.json'))) {
    try {
      const current = await record(join(backups, '.uncertain-writes.json'))
      const value = current.value as {version?: number, generation?: string, updatedAt?: string} | null
      if (!value || value.version !== 1 || !/^[a-f0-9]{48}$/.test(value.generation ?? '') || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('Invalid uncertainty marker')
      evidence.uncertainBytes = current.raw
      findings.push('An uncertainty marker is present. It does not record enough evidence to distinguish a credential failure from unfinished writes.')
      if (evidence.writer && value.generation !== evidence.writer.generation) blockers.push('Writer and uncertainty records describe different generations. Manual inspection is required.')
    } catch {blockers.push('The uncertainty marker is unreadable or unrecognized. It will not be archived automatically.')}
  }
  const hasReceipts = Boolean(evidence.writerBytes || evidence.emptyWriter || evidence.uncertainBytes)
  if (liveWriter && (blockers.length || evidence.uncertainBytes)) blockers.push('A writer process is running; recovery must not modify its records.')
  const status = blockers.length ? 'manual-recovery-required' : liveWriter ? 'writer-active' : hasReceipts ? 'review-required' : 'clear'
  return {report: {
    status,
    message: status === 'clear' ? 'No persisted recovery blocker found. Check /api/ready and correct configuration before restarting.'
      : status === 'writer-active' ? 'A writer process is running and no recovery marker was found. There is no recovery action indicated by these records. Check /api/ready for application readiness; a live process alone does not prove readiness.'
        : status === 'review-required' ? 'Legacy startup receipts need evidence that this tool cannot establish. Do not guess or answer yes to checks you cannot verify. Expert-reviewed archival is available, but ordinary configuration errors only need correction and restart.'
          : 'Recovery protection is active. These records cannot be repaired safely by local inspection alone. No files have been changed.',
    canArchiveReviewedStartup: status === 'review-required', blockers, findings
  }, evidence}
}
export async function inspectRecovery(storage: string): Promise<RecoveryReport> {return (await inspect(storage)).report}

/** Operator-reviewed archival only. Never infer quiescence from a PID/TTL,
 * clear an active restore, delete storage, or dispatch database rollback SQL. */
export async function archiveReviewedStartup(storage: string, confirmations: RecoveryConfirmations): Promise<string> {
  if (!confirmations.appStopped || !confirmations.databaseQuiescent || !confirmations.dataConsistent) throw new RecoveryRefusal('All recovery confirmations are required; a stopped app alone does not prove database quiescence or consistency')
  const root = resolve(storage), backups = join(root, 'backups'), guard = join(backups, '.ownership.guard')
  const before = await inspect(storage)
  if (!before.report.canArchiveReviewedStartup) throw new RecoveryRefusal('These records are not eligible for reviewed startup-only archival; run the recovery inspection first')
  await mkdir(guard, {mode: 0o700}) // exclusive; an existing guard is never removed
  try {
    const current = await inspect(storage, true)
    if (!current.report.canArchiveReviewedStartup || before.evidence.writerBytes !== current.evidence.writerBytes || before.evidence.emptyWriter !== current.evidence.emptyWriter || before.evidence.uncertainBytes !== current.evidence.uncertainBytes) throw new RecoveryRefusal('Recovery records changed; no archival is permitted')
    const archiveRoot = join(root, '.recovery-archive')
    if (await exists(archiveRoot)) await regularDirectory(archiveRoot)
    else await mkdir(archiveRoot, {mode: 0o700})
    const destination = join(archiveRoot, `startup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(6).toString('hex')}`)
    await mkdir(destination, {mode: 0o700})
    await writeDurableJson(join(destination, 'review.json'), {version: 1, kind: 'operator-reviewed-startup-archival', reviewedAt: new Date().toISOString(), confirmations, emptyWriterDirectory: Boolean(current.evidence.emptyWriter)})
    if (current.evidence.writerBytes || current.evidence.emptyWriter) {
      // Recheck exact receipts/emptiness under the application's acquisition
      // guard. Never turn this into permission to archive arbitrary corruption.
      if (current.evidence.emptyWriter) {
        const directory = join(backups, '.writer.lock')
        await regularDirectory(directory)
        const children = await opendir(directory)
        for await (const _entry of children) throw new RecoveryRefusal('The empty writer directory changed; preserve the recovery archive and inspect again')
      } else if (await readFile(join(backups, '.writer.lock/owner.json'), 'utf8') !== current.evidence.writerBytes) throw new RecoveryRefusal('Writer receipt changed; preserve the recovery archive and inspect again')
      await rename(join(backups, '.writer.lock'), join(destination, '.writer.lock'))
    }
    if (current.evidence.uncertainBytes) {
      if (await readFile(join(backups, '.uncertain-writes.json'), 'utf8') !== current.evidence.uncertainBytes) throw new RecoveryRefusal('Uncertainty receipt changed; preserve the recovery archive and inspect again')
      // Keep the persistent fence until ownership has been archived first.
      await rename(join(backups, '.uncertain-writes.json'), join(destination, '.uncertain-writes.json'))
    }
    await syncDirectory(destination); await syncDirectory(archiveRoot); await syncDirectory(backups)
    return destination
  } finally {await rm(guard, {recursive: true}); await syncDirectory(backups)}
}
