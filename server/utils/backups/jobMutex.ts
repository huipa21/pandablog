import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, open, lstat, rename, rm } from 'node:fs/promises'
import { hostname } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import * as path from 'node:path'
import { createError } from 'h3'
import { BACKUPS_ROOT } from './config'

export interface JobProgress {
  phase: 'preparing' | 'db-export' | 'media-collect' | 'media-pack' | 'finalize' | 'db-wipe' | 'db-restore' | 'media-restore' | 'safety-snapshot' | 'db-validate' | 'db-consolidate' | 'db-verify' | 'rollback'
  percent: number
  detail?: string
}
export interface ActiveJob { id: string, kind: 'create' | 'restore' | 'import' | 'consolidate' | 'delete', startedAt: string, progress?: JobProgress }
export interface JobOwner extends ActiveJob { readonly token: string, readonly generation: string }
export interface RestoreJournal {
  version: 1, owner: JobOwner, phase: string, updatedAt: string, destructive: boolean,
  state: 'running' | 'committed' | 'rolled-back' | 'aborted' | 'recovery-required',
  artifacts: Record<string, string>, statusHash: string, expiresAt: number, error?: string
}
interface DiskOwner { token: string, generation: string, host: string, pid: number, job?: ActiveJob }

export async function syncDirectory(directory: string) {
  let file
  try { file = await open(directory, 'r'); await file.sync() }
  catch (error) { if (process.platform !== 'win32' || !['EPERM', 'EISDIR', 'EINVAL', 'EACCES'].includes(String((error as NodeJS.ErrnoException).code))) throw error }
  finally { await file?.close() }
}
export async function writeDurableJson(filePath: string, data: unknown) {
  const temporary = `${filePath}.${randomBytes(12).toString('hex')}.tmp`
  const file = await open(temporary, 'wx', 0o600)
  try { await file.writeFile(JSON.stringify(data)); await file.sync() } finally { await file.close() }
  try { await rename(temporary, filePath); await syncDirectory(path.dirname(filePath)) }
  catch (error) { await rm(temporary, {force: true}).catch(() => {}); throw error }
}
async function readJson(filePath: string): Promise<unknown> {
  if (!(await lstat(filePath)).isFile()) throw new Error('Unsafe maintenance record')
  const file = await open(filePath, 'r')
  try {
    const bytes = Buffer.alloc(64 * 1024 + 1)
    const {bytesRead} = await file.read(bytes, 0, bytes.length, 0)
    if (bytesRead > 64 * 1024) throw new Error('Oversized maintenance record')
    return JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'))
  } finally {await file.close()}
}
function absent(error: unknown) {return (error as NodeJS.ErrnoException).code === 'ENOENT'}
function dead(owner: DiskOwner) {
  if (owner.host !== hostname() || !Number.isInteger(owner.pid) || owner.pid <= 0) return false
  try {process.kill(owner.pid, 0); return false} catch (error) {return (error as NodeJS.ErrnoException).code === 'ESRCH'}
}
function validOwner(value: unknown): value is DiskOwner {
  const v = value as DiskOwner | null
  return Boolean(v && /^[a-f0-9]{48}$/.test(v.token) && /^[a-f0-9]{48}$/.test(v.generation) && typeof v.host === 'string' && Number.isInteger(v.pid))
}
const conflict = (reason = 'maintenance-busy') => createError({statusCode: 409, message: 'Maintenance ownership is busy or requires offline recovery', data: {reason}})
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

/** Atomic directory ownership. ALL acquire/release/reclaim uses one exclusive
 * guard. An abandoned/unreadable guard is an offline recovery condition, never
 * a TTL-stealable lock. Remote hosts/multiple app writers are unsupported. */
export class JobStore {
  private active: JobOwner | null = null
  private reserved = false
  private journal: RestoreJournal | null = null
  private recovery = false
  private readonly generation = randomBytes(24).toString('hex')
  private writer?: DiskOwner
  constructor(private readonly root: string) {}
  getActiveJob() { return this.active }
  getJournal() { return this.journal }
  recoveryRequired() {return this.recovery || Boolean(this.journal && !['committed', 'rolled-back', 'aborted'].includes(this.journal.state) && !this.active)}
  async loadJournal() {
    try {
      const value = await readJson(path.join(this.root, '.restore-journal.json')) as RestoreJournal
      if (value.version !== 1 || !value.owner || !validOwner({...value.owner, host: hostname(), pid: process.pid}) || value.owner.kind !== 'restore' || !['running', 'committed', 'rolled-back', 'aborted', 'recovery-required'].includes(value.state) || !/^[a-f0-9]{64}$/.test(value.statusHash) || !Number.isFinite(value.expiresAt) || typeof value.destructive !== 'boolean' || !value.artifacts || typeof value.artifacts !== 'object') throw new Error('Invalid restore journal')
      this.journal = value
      this.recovery = !['committed', 'rolled-back', 'aborted'].includes(value.state)
    } catch (error) {if (!absent(error)) this.recovery = true}
    try {await lstat(path.join(this.root, '.uncertain-writes.json')); this.recovery = true} catch (error) {if (!absent(error)) this.recovery = true}
    return this.recoveryRequired()
  }
  async markUncertain() {
    this.recovery = true
    await writeDurableJson(path.join(this.root, '.uncertain-writes.json'), {version: 1, generation: this.generation, updatedAt: new Date().toISOString()})
  }
  private async guard<T>(work: () => Promise<T>): Promise<T> {
    await mkdir(this.root, {recursive: true, mode: 0o700})
    const guard = path.join(this.root, '.ownership.guard')
    try {await mkdir(guard, {mode: 0o700})} catch (error) {if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw conflict('ownership-guard-present'); throw error}
    // Never reclaim this guard automatically: a dead publisher needs offline
    // inspection, and unreadable/empty is not evidence of abandonment.
    try {return await work()} finally {await rm(guard, {recursive: true}); await syncDirectory(this.root)}
  }
  private async take(name: string, owner: DiskOwner, reclaim = true) {
    const directory = path.join(this.root, name)
    try {await mkdir(directory, {mode: 0o700})} catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      let previous: unknown
      try {previous = await readJson(path.join(directory, 'owner.json'))} catch {throw conflict('owner-unreadable')}
      if (!validOwner(previous)) throw conflict('owner-corrupt')
      if (previous.host !== hostname()) throw conflict('owner-remote')
      if (!dead(previous)) throw conflict(previous.pid === process.pid ? 'owner-live-same-process' : 'owner-live')
      if (!reclaim || this.recoveryRequired()) throw conflict('owner-offline-review')
      const abandoned = `${directory}.abandoned-${owner.token}`
      await rename(directory, abandoned)
      await mkdir(directory, {mode: 0o700})
      await rm(abandoned, {recursive: true})
    }
    await writeDurableJson(path.join(directory, 'owner.json'), owner)
    await syncDirectory(this.root)
  }
  private async remove(name: string, owner: DiskOwner) {
    const directory = path.join(this.root, name)
    const current = await readJson(path.join(directory, 'owner.json')).catch(error => {if (absent(error)) return null; throw error})
    if (!validOwner(current) || current.token !== owner.token || current.generation !== owner.generation) return false
    await rm(directory, {recursive: true})
    await syncDirectory(this.root)
    return true
  }
  async startWriter() {
    await this.loadJournal()
    const writer = {token: randomBytes(24).toString('hex'), generation: this.generation, host: hostname(), pid: process.pid}
    // Recovery still starts liveness/status only. Do not claim an existing
    // crashed writer receipt or permit migrations in that state.
    if (this.recoveryRequired()) return false
    await this.guard(async () => {
      await this.take('.writer.lock', writer, false)
      try {
        let previous: unknown
        try {previous = await readJson(path.join(this.root, '.job.lock/owner.json'))} catch (error) {if (!absent(error)) throw conflict()}
        if (previous) {
          if (!validOwner(previous) || !dead(previous)) throw conflict()
          await this.remove('.job.lock', previous)
        }
      } catch (error) {await this.remove('.writer.lock', writer); throw error}
    })
    this.writer = writer
    return true
  }
  /** Nitro starts a replacement worker before awaiting the old worker close.
   * Wait only for a same-process live generation / transient publication guard
   * to release cleanly. Never remove/adopt its receipt or retry stale, remote,
   * corrupt or recovery authority. Forced termination still requires recovery. */
  async startWriterAfterDevDrain(stopping: () => boolean, deadlineMs = 5_000) {
    const deadline = Date.now() + deadlineMs
    while (!stopping()) {
      try {
        if (await this.loadJournal()) return false
        let previous: unknown
        try {previous = await readJson(path.join(this.root, '.writer.lock/owner.json'))} catch (error) {if (!absent(error)) throw conflict('owner-unreadable')}
        // Non-authoritative read avoids repeatedly occupying the publication
        // guard while the old worker is trying to release it. Acquisition still
        // uses startWriter's atomic guard and token checks after disappearance.
        if (validOwner(previous) && previous.host === hostname() && previous.pid === process.pid) {
          if (Date.now() >= deadline) throw conflict('owner-live-same-process')
          await delay(Math.min(50, Math.max(1, deadline - Date.now())))
          continue
        }
        return await this.startWriter()
      } catch (error) {
        const reason = (error as {data?: {reason?: string}})?.data?.reason
        if (!['owner-live-same-process', 'ownership-guard-present'].includes(reason ?? '') || Date.now() >= deadline) throw error
        await delay(Math.min(50, Math.max(1, deadline - Date.now())))
      }
    }
    return false
  }
  async stopWriter(): Promise<boolean> {
    if (!this.writer) return true
    if (this.active || this.recoveryRequired()) return false
    const writer = this.writer
    const removed = await this.guard(async () => {
      // Do not claim verified release when new persisted recovery authority or
      // a mismatched generation is found during cleanup.
      if (await this.loadJournal()) return false
      return this.remove('.writer.lock', writer)
    })
    if (removed) this.writer = undefined
    return removed
  }
  async acquire(job: ActiveJob): Promise<JobOwner> {
    if (this.reserved || this.active || this.recoveryRequired()) throw conflict()
    this.reserved = true // before the first await
    const owner: JobOwner = Object.freeze({...job, token: randomBytes(24).toString('hex'), generation: this.generation})
    try {
      await this.loadJournal()
      if (this.recoveryRequired()) throw conflict()
      await this.guard(() => this.take('.job.lock', {token: owner.token, generation: owner.generation, host: hostname(), pid: process.pid, job: {id: job.id, kind: job.kind, startedAt: job.startedAt}}))
      this.active = owner
      return owner
    } finally {this.reserved = false}
  }
  async beginRestore(owner: JobOwner): Promise<string> {
    this.assert(owner)
    const token = randomBytes(32).toString('hex')
    const journal: RestoreJournal = {version: 1, owner, phase: 'preparing', updatedAt: new Date().toISOString(), destructive: false, state: 'running', artifacts: {}, statusHash: hash(token), expiresAt: Date.now() + 24 * 60 * 60_000}
    await this.persist(journal)
    this.journal = journal
    return token
  }
  async transition(owner: JobOwner, fields: Partial<Pick<RestoreJournal, 'phase' | 'destructive' | 'state' | 'artifacts' | 'error'>>) {
    this.assert(owner)
    if (!this.journal || this.journal.owner.token !== owner.token) throw new Error('Restore journal owner mismatch')
    const journal = {...this.journal, ...fields, updatedAt: new Date().toISOString()}
    await this.persist(journal)
    this.journal = journal
  }
  private async persist(journal: RestoreJournal) {
    try {await writeDurableJson(path.join(this.root, '.restore-journal.json'), journal)}
    catch (error) {this.recovery = true; throw error}
  }
  private assert(owner: JobOwner) {if (this.active?.token !== owner.token || this.active.generation !== owner.generation) throw new Error('Stale maintenance owner')}
  progress(progress: JobProgress) {
    if (this.active) this.active = Object.freeze({...this.active, progress: {...progress, percent: Math.max(0, Math.min(100, Math.round(progress.percent)))}})
  }
  authorizeStatus(token: string) {
    if (!this.journal || Date.now() > this.journal.expiresAt || !/^[a-f0-9]{64}$/.test(token)) return false
    return timingSafeEqual(Buffer.from(this.journal.statusHash, 'hex'), Buffer.from(hash(token), 'hex'))
  }
  async release(owner: JobOwner) {
    if (this.active?.token !== owner.token) return // old release cannot remove successor
    if (owner.kind === 'restore' && (this.recovery || !this.journal || !['committed', 'rolled-back', 'aborted'].includes(this.journal.state))) {this.recovery = true; return}
    await this.guard(() => this.remove('.job.lock', {token: owner.token, generation: owner.generation, host: hostname(), pid: process.pid}))
    this.active = null
  }
}
export const jobStore = new JobStore(BACKUPS_ROOT)
export const getActiveJob = () => jobStore.getActiveJob()
export const acquireJob = (job: ActiveJob) => jobStore.acquire(job)
export const releaseJob = (owner: JobOwner) => jobStore.release(owner)
export const updateJobProgress = (progress: JobProgress) => jobStore.progress(progress)
