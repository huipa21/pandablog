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

let _activeJob: ActiveJob | null = null

export function getActiveJob(): ActiveJob | null {
  return _activeJob
}

export function acquireJob(job: ActiveJob): void {
  if (_activeJob) {
    throw createError({
      statusCode: 409,
      message: `A backup job (${_activeJob.kind}) is already running since ${_activeJob.startedAt}. Please wait for it to complete.`,
    })
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

export function releaseJob(): void {
  _activeJob = null
}
