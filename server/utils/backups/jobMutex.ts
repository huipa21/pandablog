import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { hostname } from 'node:os'
import * as path from 'node:path'
import { BACKUPS_ROOT } from './config'

export interface JobProgress {
  /** Coarse phase of the running job. */
  phase: 'preparing' | 'db-export' | 'media-collect' | 'media-pack' | 'finalize' | 'db-wipe' | 'db-restore' | 'media-restore' | 'safety-snapshot' | 'db-validate' | 'db-consolidate' | 'db-verify' | 'rollback'
  /** Overall completion percentage, 0–100. */
  percent: number
  /** Optional human-readable detail, e.g. "123 / 456 files". */
  detail?: string
}

export interface ActiveJob {
  id: string
  kind: 'create' | 'restore' | 'import'
  startedAt: string
  progress?: JobProgress
}

/** On-disk representation of the cross-process lock. */
interface LockFileData {
  id: string
  kind: ActiveJob['kind']
  startedAt: string
  pid: number
  host: string
}

/**
 * The lock file lives in the shared storage volume (`storage/backups`), NOT in
 * SurrealDB: a restore wipes the database, so a DB-backed lock would be deleted
 * mid-job. Because every Nitro worker / replica mounts the same volume, a single
 * lock file is a correct mutual-exclusion primitive across all of them.
 */
const LOCK_PATH = path.join(BACKUPS_ROOT, '.job.lock')

/**
 * A lock owned by a remote host (where we cannot probe the pid) is treated as
 * abandoned after this long. Generous so a genuinely long restore is never
 * stolen out from under itself.
 */
const STALE_LOCK_TTL_MS = 6 * 60 * 60 * 1000 // 6h

let _activeJob: ActiveJob | null = null

export function getActiveJob(): ActiveJob | null {
  return _activeJob
}

/** True if a process with the given pid is currently running on this host. */
function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    // Signal 0 performs existence/permission checks without actually signalling.
    process.kill(pid, 0)
    return true
  } catch (err) {
    // ESRCH = no such process (dead). EPERM = exists but owned by another user.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function isLockStale(lock: LockFileData): boolean {
  // Same host: the pid probe is authoritative — a dead pid means the owning
  // worker crashed and the lock can be reclaimed immediately.
  if (lock.host === hostname()) {
    return !isProcessAlive(lock.pid)
  }
  // Different host (scaled deployment): we cannot probe the pid, so fall back to
  // a time-to-live.
  const started = Date.parse(lock.startedAt)
  if (!Number.isFinite(started)) return true
  return Date.now() - started > STALE_LOCK_TTL_MS
}

async function readLock(): Promise<LockFileData | null> {
  try {
    const parsed = JSON.parse(await readFile(LOCK_PATH, 'utf8')) as LockFileData
    if (parsed && typeof parsed.id === 'string' && typeof parsed.pid === 'number') {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

function conflict(kind: string, startedAt: string): never {
  throw createError({
    statusCode: 409,
    message: `A backup job (${kind}) is already running since ${startedAt}. Please wait for it to complete.`,
  })
}

/**
 * Acquires the single global job lock. Backed by BOTH an in-process flag (fast
 * path for the common single-process deployment) AND an on-disk lock file under
 * the shared storage volume, so two Nitro workers / replicas that share
 * `storage/backups` can never run destructive jobs concurrently. The disk lock
 * also survives the database wipe performed during a restore.
 *
 * Throws a 409 if a non-stale job is already running.
 */
export async function acquireJob(job: ActiveJob): Promise<void> {
  // Fast path: this process already holds (or is mid-acquire of) the lock.
  if (_activeJob) {
    conflict(_activeJob.kind, _activeJob.startedAt)
  }

  await mkdir(BACKUPS_ROOT, { recursive: true })

  const payload: LockFileData = {
    id: job.id,
    kind: job.kind,
    startedAt: job.startedAt,
    pid: process.pid,
    host: hostname(),
  }
  const body = JSON.stringify(payload)

  try {
    // 'wx' = create exclusively; fails with EEXIST if the lock already exists.
    await writeFile(LOCK_PATH, body, { flag: 'wx' })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err

    const existing = await readLock()
    if (existing && !isLockStale(existing)) {
      conflict(existing.kind, existing.startedAt)
    }
    // Stale or unreadable lock: reclaim it.
    if (import.meta.dev && existing) {
      console.warn(`[backup] Reclaiming stale job lock from pid ${existing.pid} on ${existing.host}`)
    }
    await writeFile(LOCK_PATH, body, { flag: 'w' })
  }

  _activeJob = job
}

/** Updates the progress of the currently running job, if any. */
export function updateJobProgress(progress: JobProgress): void {
  if (_activeJob) {
    _activeJob.progress = {
      ...progress,
      percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
    }
  }
}

/** Releases the in-process flag and removes the on-disk lock file. */
export async function releaseJob(): Promise<void> {
  _activeJob = null
  await rm(LOCK_PATH, { force: true }).catch(() => {})
}
