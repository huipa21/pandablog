import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, open, lstat, rename, rm, rmdir, opendir } from 'node:fs/promises'
import { hostname } from 'node:os'
import * as path from 'node:path'
import { createError } from 'h3'
import { BACKUPS_ROOT } from './config'
import { UNCERTAIN_WRITE_QUIESCENCE_MS, writeBarrier } from '../maintenance'

export interface JobProgress {
  phase: 'preparing' | 'db-export' | 'media-collect' | 'media-pack' | 'bundle-pack' | 'finalize' | 'db-wipe' | 'db-restore' | 'media-restore' | 'safety-snapshot' | 'db-validate' | 'db-consolidate' | 'db-verify' | 'rollback'
  percent: number
  detail?: string
}
export interface ActiveJob { id: string, kind: 'create' | 'restore' | 'import' | 'package' | 'consolidate' | 'delete' | 'password-reset', startedAt: string, progress?: JobProgress }
export interface JobOwner extends ActiveJob { readonly token: string, readonly generation: string }
export interface RestoreJournal {
  version: 1, owner: JobOwner, phase: string, updatedAt: string, destructive: boolean,
  state: 'running' | 'committed' | 'rolled-back' | 'aborted' | 'recovery-required',
  artifacts: Record<string, string>, statusHash: string, expiresAt: number, error?: string
}
interface DiskOwner { token: string, generation: string, host: string, pid: number, job?: ActiveJob }
const absent = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
const conflict = (reason = 'maintenance-busy') => createError({statusCode: 409, message: 'Maintenance job busy or unavailable; retry or inspect job ownership', data: {reason}})
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const preDestructivePhases = ['preparing', 'db-validate', 'safety-snapshot']
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
export async function readMaintenanceJson(filePath: string): Promise<unknown> {
  const stat = await lstat(filePath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw new Error('Unsafe maintenance record')
  const file = await open(filePath, 'r')
  try {
    const bytes = Buffer.alloc(64 * 1024 + 1)
    const {bytesRead} = await file.read(bytes, 0, bytes.length, 0)
    if (bytesRead > 64 * 1024) throw new Error('Oversized maintenance record')
    return JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'))
  } finally {await file.close()}
}
async function exists(file: string) {try {await lstat(file); return true} catch (error) {if (absent(error)) return false; throw error}}
async function directory(file: string) {
  const stat = await lstat(file)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe maintenance directory')
}
function dead(owner: {host: string, pid: number}) {
  if (owner.host !== hostname() || !Number.isInteger(owner.pid) || owner.pid <= 0) return false
  try {process.kill(owner.pid, 0); return false} catch (error) {return (error as NodeJS.ErrnoException).code === 'ESRCH'}
}
function validOwner(value: unknown): value is DiskOwner {
  const v = value as DiskOwner | null
  return Boolean(v && /^[a-f0-9]{48}$/.test(v.token) && /^[a-f0-9]{48}$/.test(v.generation) && typeof v.host === 'string' && Number.isInteger(v.pid) && v.pid > 0)
}
async function diskJob(root: string) {
  const lock = path.join(root, '.job.lock'), stat = await lstat(lock)
  if (stat.isDirectory() && !stat.isSymbolicLink()) return {value: await readMaintenanceJson(path.join(lock, 'owner.json')), legacy: false}
  if (stat.isFile() && !stat.isSymbolicLink()) return {value: await readMaintenanceJson(lock), legacy: true}
  throw new Error('Unsafe job ownership')
}

/** Read-only bounded classification shared by boot, jobs and offline inspection.
 * Retired writer/guard paths are never opened, traversed or changed. */
export async function inspectRestoreState(root: string): Promise<{journal: RestoreJournal | null, recovery: boolean, preDestructive: boolean}> {
  let journal: RestoreJournal | null = null, recovery = false, preDestructive = false
  if (!await exists(root)) return {journal, recovery, preDestructive}
  await directory(root)
  try {
    const v = await readMaintenanceJson(path.join(root, '.restore-journal.json')) as RestoreJournal
    if (!v || v.version !== 1 || !v.owner || !validOwner({...v.owner, host: hostname(), pid: process.pid}) || v.owner.kind !== 'restore' || !['running', 'committed', 'rolled-back', 'aborted', 'recovery-required'].includes(v.state) || !/^[a-f0-9]{64}$/.test(v.statusHash) || !Number.isFinite(v.expiresAt) || !Number.isFinite(Date.parse(v.updatedAt)) || typeof v.destructive !== 'boolean' || !v.artifacts || typeof v.artifacts !== 'object' || Array.isArray(v.artifacts)) throw new Error('Invalid restore journal')
    const stage = path.join(root, `.restore-${v.owner.token}`)
    const expected: Record<string, string> = {directory: stage, safetySql: path.join(stage, 'safety.surql'), oldUploads: path.join(stage, 'old-uploads'), oldVariants: path.join(stage, 'old-variants'), mediaStage: path.join(stage, 'media-stage'), uploads: path.resolve(root, '../uploads'), variants: path.resolve(root, '../variants')}
    for (const [key, value] of Object.entries(v.artifacts)) {
      if (typeof value !== 'string' || !expected[key] || path.resolve(value) !== expected[key]) throw new Error('Invalid restore artifact')
    }
    if (await exists(stage)) await directory(stage)
    preDestructive = !v.destructive && preDestructivePhases.includes(v.phase)
    if (preDestructive && (await exists(path.join(stage, 'old-uploads')) || await exists(path.join(stage, 'old-variants')))) throw new Error('Contradictory media cutover evidence')
    const terminal = (v.state === 'committed' && v.destructive && v.phase === 'finalize') || (v.state === 'rolled-back' && v.destructive && v.phase === 'rollback') || (v.state === 'aborted' && preDestructive)
    if (['committed', 'rolled-back', 'aborted'].includes(v.state) && !terminal) throw new Error('Contradictory terminal outcome')
    journal = v
    recovery = !terminal && !preDestructive
  } catch (error) {if (!absent(error)) recovery = true}
  // The legacy file producer had no journal. Restore-kind ownership without a
  // corresponding journal is ambiguous. Corrupt NON-restore locks restrict jobs
  // only; they are not enough to invent destructive restore evidence.
  try {
    const {value, legacy} = await diskJob(root)
    const kind = legacy ? (value as ActiveJob)?.kind : (value as DiskOwner)?.job?.kind
    if (kind === 'restore' && (!journal || legacy || (value as DiskOwner).token !== journal.owner.token || (value as DiskOwner).generation !== journal.owner.generation)) recovery = true
  } catch { /* Classification of unreadable ordinary job ownership is job-only. */ }
  const entries = await opendir(root)
  let count = 0
  for await (const entry of entries) {
    if (++count > 4096) throw new Error('Maintenance inspection limit exceeded')
    if (entry.name.startsWith('.restore-') && entry.name !== '.restore-journal.json' && !/^\.restore-journal\.json\.[a-f0-9]{24}\.tmp$/.test(entry.name)) {
      if (!journal || entry.name !== `.restore-${journal.owner.token}`) recovery = true
    }
  }
  // Older restore had NO journal/intent flag. Its recognized pre-restore SQL
  // or moved uploads cannot prove pre-destructive/terminal state; preserve as
  // ambiguous restore. An empty directory or unrelated historical export alone
  // is informational, never a generic startup owner.
  const legacySafety = path.join(root, '.safety')
  if (await exists(legacySafety)) {
    try {
      await directory(legacySafety)
      let scanned = 0
      for await (const entry of await opendir(legacySafety)) {
        if (++scanned > 4096 || entry.name.startsWith('pre-restore-uploads-') || /^pre-restore-.+\.surql$/.test(entry.name)) {recovery = true; break}
      }
    } catch {recovery = true}
  }
  return {journal, recovery, preDestructive: preDestructive && !recovery}
}

async function cleanPreparation(root: string, journal: RestoreJournal) {
  const stage = path.join(root, `.restore-${journal.owner.token}`)
  if (!await exists(stage)) return
  await directory(stage)
  const allowed = new Set(['safety.surql', 'own.surql', 'base.surql', 'merged.surql', 'media-stage'])
  for await (const entry of await opendir(stage)) if (!allowed.has(entry.name)) throw new Error('Unknown preparation artifact; preserved')
  let count = 0
  async function check(dir: string, depth: number) {
    if (depth > 8) throw new Error('Preparation depth limit')
    for await (const entry of await opendir(dir)) {
      if (++count > 100_000) throw new Error('Preparation inspection limit')
      const file = path.join(dir, entry.name), stat = await lstat(file)
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error('Unsafe preparation artifact')
      if (stat.isDirectory()) await check(file, depth + 1)
    }
  }
  await check(stage, 0)
  await rm(stage, {recursive: true}); await syncDirectory(root)
}

/** Atomic job directory, NOT application ownership. A per-observed-token
 * reclamation directory serializes dead-local contenders. No TTL live stealing,
 * shared publication guard or startup latch. Unknown/remote/partial ownership
 * requires a narrow offline JOB remedy, never DB-consistency certification. */
export class JobStore {
  private active: JobOwner | null = null
  private reserved = false
  private journal: RestoreJournal | null = null
  private recovery = false
  private uncertainUntil = 0
  private malformedUntil = 0
  private malformedKey = ''
  private uncertainFile: Promise<unknown> = Promise.resolve()
  private readonly generation = randomBytes(24).toString('hex')
  private readonly processHoldUntil: number
  private abandonedUntil = 0
  constructor(private readonly root: string, processQuiescenceMs = 0, private readonly abandonedQuiescenceMs = 0) {this.processHoldUntil = Date.now() + processQuiescenceMs}
  getActiveJob() {return this.active}
  getJournal() {return this.journal}
  recoveryRequired() {return this.recovery || Boolean(this.journal?.destructive && this.journal.state === 'recovery-required')}
  uncertaintyUntil() {return this.uncertainUntil > Date.now() ? this.uncertainUntil : 0}
  maintenanceHoldUntil() {return Math.max(this.uncertaintyUntil(), this.processHoldUntil > Date.now() ? this.processHoldUntil : 0, this.abandonedUntil > Date.now() ? this.abandonedUntil : 0)}
  async loadJournal() {
    const state = await inspectRestoreState(this.root)
    this.journal = state.journal
    this.recovery = state.recovery
    await this.loadUncertainty()
    return this.recovery
  }
  /** Only application preflight may abort a former app's isolated preparation.
   * Deployment guarantees its predecessor is stopped; CLI/job acquire never
   * calls this mutating method. Only proven isolated preparation is cleaned;
   * live DB/media, destructive safety and unknown artifacts are never deleted. */
  async initializeRestoreState() {
    await this.loadJournal()
    if (!this.recovery && this.journal && !['committed', 'rolled-back', 'aborted'].includes(this.journal.state) && !this.journal.destructive && preDestructivePhases.includes(this.journal.phase)) {
      this.journal = {...this.journal, state: 'aborted', updatedAt: new Date().toISOString()}
      await writeDurableJson(path.join(this.root, '.restore-journal.json'), this.journal)
    }
    if (!this.recovery && this.journal?.state === 'aborted' && !this.journal.destructive) {
      await cleanPreparation(this.root, this.journal).catch(() => {console.warn('[restore] owned preparation cleanup incomplete; staging preserved and new restores may remain unavailable')})
    }
    return !this.recovery
  }
  private async uncertaintyRecord() {
    try {
      const value = await readMaintenanceJson(path.join(this.root, '.uncertain-writes.json')) as {updatedAt?: unknown, generation?: unknown} | null
      return {updatedAt: typeof value?.updatedAt === 'string' ? Date.parse(value.updatedAt) : Number.NaN, key: hash(JSON.stringify([value?.generation, value?.updatedAt]))}
    } catch (error) {if (absent(error)) return null; return {updatedAt: Number.NaN, key: 'unreadable'}}
  }
  private async loadUncertainty() {
    const record = await this.uncertaintyRecord()
    if (!record) return
    let updatedAt = record.updatedAt
    if (this.malformedUntil && record.key === this.malformedKey) updatedAt = this.malformedUntil - UNCERTAIN_WRITE_QUIESCENCE_MS
    else if (!Number.isFinite(updatedAt) || updatedAt > Date.now()) {
      this.malformedUntil = Date.now() + UNCERTAIN_WRITE_QUIESCENCE_MS
      this.malformedKey = record.key
      updatedAt = this.malformedUntil - UNCERTAIN_WRITE_QUIESCENCE_MS
    }
    this.uncertainUntil = Math.max(this.uncertainUntil, updatedAt + UNCERTAIN_WRITE_QUIESCENCE_MS)
    await this.settleUncertainty()
  }
  async settleUncertainty() {
    const task = this.uncertainFile.then(async () => {
      if (!this.uncertainUntil || Date.now() < this.uncertainUntil) return
      // A second CLI may have published a newer marker; never clear its hold.
      const record = await this.uncertaintyRecord()
      const updatedAt = record?.key === this.malformedKey ? Number.NaN : record?.updatedAt ?? Number.NaN
      if (Number.isFinite(updatedAt) && updatedAt <= Date.now() && updatedAt + UNCERTAIN_WRITE_QUIESCENCE_MS > Date.now()) {this.uncertainUntil = updatedAt + UNCERTAIN_WRITE_QUIESCENCE_MS; return}
      // Keep the informational marker unchanged. Expiry does not require unlink
      // racing another process's new publication; it is not startup authority.
      this.uncertainUntil = 0
    })
    this.uncertainFile = task.catch(() => {})
    await task
  }
  async markUncertain() {
    this.uncertainUntil = Date.now() + UNCERTAIN_WRITE_QUIESCENCE_MS
    const task = this.uncertainFile.then(async () => {
      await mkdir(this.root, {recursive: true, mode: 0o700}); await directory(this.root)
      await writeDurableJson(path.join(this.root, '.uncertain-writes.json'), {version: 1, generation: this.generation, updatedAt: new Date().toISOString()})
    })
    this.uncertainFile = task.catch(() => {})
    await task
  }
  private async take(owner: DiskOwner) {
    const lock = path.join(this.root, '.job.lock')
    try {await mkdir(lock, {mode: 0o700})} catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      let previous: Awaited<ReturnType<typeof diskJob>>
      try {previous = await diskJob(this.root)} catch {throw conflict('owner-unreadable')}
      const v = previous.value as DiskOwner & ActiveJob
      if ((!previous.legacy && !validOwner(v)) || (previous.legacy && (!v || !['create', 'import', 'restore'].includes(v.kind) || typeof v.id !== 'string' || typeof v.host !== 'string' || !Number.isInteger(v.pid)))) throw conflict('owner-corrupt')
      if (!dead(v)) throw conflict(v.host !== hostname() ? 'owner-remote' : 'owner-live')
      const key = previous.legacy ? hash(JSON.stringify(v)) : v.token
      if (this.abandonedQuiescenceMs) {
        // A reset/job can die before persisting uncertainty while the app stays
        // up. Dead PID is NOT DB cancellation proof: record a finite job-only
        // hold for this exact abandoned generation before permitting takeover.
        const hold = path.join(this.root, `.job-quiescence-${key}.json`)
        try {
          const file = await open(hold, 'wx', 0o600)
          try {await file.writeFile(JSON.stringify({until: Date.now() + this.abandonedQuiescenceMs})); await file.sync()} finally {await file.close()}
          await syncDirectory(this.root)
        } catch (error) {if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error}
        let until: unknown
        try {until = (await readMaintenanceJson(hold) as {until?: unknown}).until} catch {throw conflict('job-quiescence-unreadable')}
        if (typeof until !== 'number' || !Number.isFinite(until) || until > Date.now() + this.abandonedQuiescenceMs) throw conflict('job-quiescence-unreadable')
        this.abandonedUntil = until
        if (Date.now() < until) throw conflict('abandoned-job-quiescing')
      }
      const reclaim = path.join(this.root, `.job-reclaim-${key}`)
      try {await mkdir(reclaim, {mode: 0o700})} catch {throw conflict('job-reclaim-busy')}
      try {
        // Exclusive reclaimer must recheck EXACT ownership; never rename a
        // successor installed between its initial observation and reservation.
        const current = await diskJob(this.root)
        if (JSON.stringify(current) !== JSON.stringify(previous)) throw conflict('owner-changed')
        const abandoned = path.join(this.root, `.job-abandoned-${owner.token}`)
        await rename(lock, abandoned)
        await mkdir(lock, {mode: 0o700})
        if (this.abandonedQuiescenceMs) await rm(path.join(this.root, `.job-quiescence-${key}.json`))
        // Only remove the recognized record, never unknown children recursively.
        if (previous.legacy) await rm(abandoned)
        else {await rm(path.join(abandoned, 'owner.json')); await rmdir(abandoned)}
      } finally {await rmdir(reclaim)}
    }
    await writeDurableJson(path.join(lock, 'owner.json'), owner)
    await syncDirectory(this.root)
  }
  async acquire(job: ActiveJob): Promise<JobOwner> {
    if (this.reserved || this.active || this.recovery) throw conflict()
    this.reserved = true
    const owner: JobOwner = Object.freeze({...job, token: randomBytes(24).toString('hex'), generation: this.generation})
    try {
      await this.loadJournal()
      if (this.recovery) throw conflict('restore-recovery-required')
      if (this.uncertaintyUntil()) throw conflict('uncertain-writes-quiescing')
      if (Date.now() < this.processHoldUntil) throw conflict('process-start-quiescing')
      await mkdir(this.root, {recursive: true, mode: 0o700}); await directory(this.root)
      await this.take({token: owner.token, generation: owner.generation, host: hostname(), pid: process.pid, job: {id: job.id, kind: job.kind, startedAt: job.startedAt}})
      this.active = owner
      return owner
    } finally {this.reserved = false}
  }
  async beginRestore(owner: JobOwner): Promise<string> {
    this.assert(owner)
    // Never orphan a retained terminal safety generation by replacing its journal.
    if (this.journal && await exists(path.join(this.root, `.restore-${this.journal.owner.token}`))) throw conflict('restore-artifacts-retained')
    const token = randomBytes(32).toString('hex')
    const journal: RestoreJournal = {version: 1, owner, phase: 'preparing', updatedAt: new Date().toISOString(), destructive: false, state: 'running', artifacts: {}, statusHash: hash(token), expiresAt: Date.now() + 24 * 60 * 60_000}
    await this.persist(journal); this.journal = journal
    return token
  }
  async transition(owner: JobOwner, fields: Partial<Pick<RestoreJournal, 'phase' | 'destructive' | 'state' | 'artifacts' | 'error'>>) {
    this.assert(owner)
    if (!this.journal || this.journal.owner.token !== owner.token) throw new Error('Restore journal owner mismatch')
    const journal = {...this.journal, ...fields, updatedAt: new Date().toISOString()}
    await this.persist(journal); this.journal = journal
  }
  private async persist(journal: RestoreJournal) {
    try {await writeDurableJson(path.join(this.root, '.restore-journal.json'), journal)}
    catch (error) {if (journal.destructive || this.journal?.destructive) this.recovery = true; throw error}
  }
  private assert(owner: JobOwner) {if (this.active?.token !== owner.token || this.active.generation !== owner.generation) throw new Error('Stale maintenance owner')}
  progress(progress: JobProgress) {if (this.active) this.active = Object.freeze({...this.active, progress: {...progress, percent: Math.max(0, Math.min(100, Math.round(progress.percent)))}})}
  authorizeStatus(token: string) {
    if (!this.journal || Date.now() > this.journal.expiresAt || !/^[a-f0-9]{64}$/.test(token)) return false
    return timingSafeEqual(Buffer.from(this.journal.statusHash, 'hex'), Buffer.from(hash(token), 'hex'))
  }
  async release(owner: JobOwner) {
    if (this.active?.token !== owner.token || this.active.generation !== owner.generation) return
    if (owner.kind === 'restore' && this.journal?.owner.token === owner.token && (this.recovery || !['committed', 'rolled-back', 'aborted'].includes(this.journal.state))) {this.recovery = Boolean(this.journal?.destructive); return}
    const lock = path.join(this.root, '.job.lock')
    await directory(lock)
    const current = await readMaintenanceJson(path.join(lock, 'owner.json'))
    if (!validOwner(current) || current.token !== owner.token || current.generation !== owner.generation) throw conflict('owner-changed')
    await rm(path.join(lock, 'owner.json')); await rmdir(lock); await syncDirectory(this.root)
    this.active = null
  }
}
// No receipt can cover a crash BEFORE uncertainty persistence. New application
// processes therefore delay backup-family jobs (NOT readiness) for the server
// execution bound. DB query/transaction timeouts must be below ten minutes.
export const jobStore = new JobStore(BACKUPS_ROOT, UNCERTAIN_WRITE_QUIESCENCE_MS, UNCERTAIN_WRITE_QUIESCENCE_MS)
export const getActiveJob = () => jobStore.getActiveJob()
export const acquireJob = (job: ActiveJob) => {
  if (writeBarrier.status().closed) return Promise.reject(conflict('admission-closed'))
  return jobStore.acquire(job)
}
export const releaseJob = (owner: JobOwner) => jobStore.release(owner)
export const updateJobProgress = (progress: JobProgress) => jobStore.progress(progress)
