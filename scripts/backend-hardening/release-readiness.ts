import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

export type Stage = 'local' | 'predeploy' | 'postdeploy'
const tiers = ['source', 'unit', 'integration', 'rehearsal', 'operator'] as const
export const GATES = [
  { id: 'node22-checks', stage: 'local', tier: 'integration', requirement: 'Full lint/typecheck/default units and diff check on pinned Node 22' },
  { id: 'db-security-faults', stage: 'local', tier: 'integration', requirement: 'Real stable 3.2.x combined regressions; scoped runtime and separate ROOT maintenance' },
  { id: 'module-builds', stage: 'local', tier: 'integration', requirement: 'Full/minimal/touched-disabled module builds and production Nitro smoke' },
  { id: 'linux-filesystem', stage: 'local', tier: 'rehearsal', requirement: 'Linux symlink/hardlink/fsync/rename/permissions/disk-full cases' },
  { id: 'browser-proxy', stage: 'local', tier: 'integration', requirement: 'Real Nitro/browser/proxy privacy/CSRF/IPX/SSR isolation, en and zh-CN' },
  { id: 'crash-recovery', stage: 'local', tier: 'rehearsal', requirement: 'Owned-process DB/media/publication/checkpoint crash matrix and recovery artifacts' },
  { id: 'mixed-load', stage: 'local', tier: 'rehearsal', requirement: 'Constrained mixed-load RSS/native/DB/disk/queues and predeclared HTTP latency targets' },
  { id: 'operations-handoff', stage: 'predeploy', tier: 'operator', requirement: 'Final defaults/env/migrations/recovery/findings and existing logging gates reviewed' },
  { id: 'copy-rehearsal', stage: 'predeploy', tier: 'operator', requirement: 'Authorized isolated production-copy rehearsal, separate mounts, no live-source writes' },
  { id: 'backup-rollback', stage: 'predeploy', tier: 'operator', requirement: 'Verified paired backups, rollback image/config/schema and owner/session recovery' },
  { id: 'mounts-budgets', stage: 'predeploy', tier: 'operator', requirement: 'Persistent receipts/journals/temp/media/log paths, UID/GID/disk/resources verified' },
  { id: 'proxy-cache-purge', stage: 'predeploy', tier: 'operator', requirement: 'Existing CDN/proxy media purge and actual privacy policy verified' },
  { id: 'single-writer', stage: 'predeploy', tier: 'operator', requirement: 'No old/new writer overlap or external/multiple writers at cutover' },
  { id: 'cutover-authorization', stage: 'predeploy', tier: 'operator', requirement: 'Explicit operator authorization for this candidate and deployment' },
  { id: 'deployed-security', stage: 'postdeploy', tier: 'operator', requirement: 'Owner/stale sessions/roles/CSRF/private media/jobs/health through actual proxy' },
  { id: 'overnight', stage: 'postdeploy', tier: 'operator', requirement: 'Actual 24-hour/UTC rollover/scheduled-job/resource observations and rollback readiness' }
] as const

const artifactPath = /^docs\/backend-hardening\/evidence\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:json|md|txt)$/
const revisionSchema = z.string().regex(/^[a-f0-9]{40}$/)
const text = z.string().trim().min(1).max(4096)
const runtimeSchema = z.object({
  node: text, surreal: text, sdk: text, nuxt: text, sharp: text, os: text
}).strict()
const recordSchema = z.object({
  id: z.enum(GATES.map(gate => gate.id)),
  status: z.enum(['pending', 'blocked', 'failed', 'passed', 'accepted-risk']),
  note: text.optional(), revision: revisionSchema.optional(), observedAt: z.iso.datetime().optional(),
  tier: z.enum(tiers).optional(), command: text.optional(), summary: text.optional(),
  runtime: runtimeSchema.optional(), profile: text.optional(), operator: text.optional(),
  rationale: text.optional(), mitigation: text.optional(), expiresAt: z.iso.datetime().optional(),
  artifacts: z.array(z.object({ path: z.string().regex(artifactPath), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(8).optional()
}).strict().superRefine((row, ctx) => {
  if (row.status !== 'passed' && row.status !== 'accepted-risk') return
  for (const key of ['revision', 'observedAt', 'tier', 'command', 'summary', 'runtime', 'artifacts'] as const) {
    if (row[key] === undefined) ctx.addIssue({ code: 'custom', message: `Completed evidence requires ${key}` })
  }
  if (row.status === 'accepted-risk') {
    for (const key of ['operator', 'rationale', 'mitigation', 'expiresAt'] as const) {
      if (row[key] === undefined) ctx.addIssue({ code: 'custom', message: `Risk acceptance requires ${key}` })
    }
  }
})
const evidenceSchema = z.object({ version: z.literal(1), records: z.array(recordSchema).max(GATES.length) }).strict()
export type Evidence = z.infer<typeof evidenceSchema>

export function parseEvidence(value: unknown): Evidence {
  const result = evidenceSchema.parse(value)
  if (new Set(result.records.map(row => row.id)).size !== result.records.length) throw new Error('Duplicate evidence gate')
  return result
}

export function parseTaskStatuses(markdown: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of markdown.split('\n')) {
    const match = /^\|\s*(REV-\d+\.\d+)\s*\|[^|]*\|\s*([^|]+?)\s*\|/.exec(line)
    if (!match) continue
    const id = match[1]!
    const status = match[2]!
    if (id in result || !['todo', 'in-progress', 'blocked', 'done', 'skipped'].includes(status)) throw new Error('Invalid/duplicate task ledger row')
    result[id] = status
  }
  return result
}

const prerequisites = [
  'REV-0.0', 'REV-0.1', ...Array.from({ length: 6 }, (_, n) => `REV-1.${n + 1}`),
  ...Array.from({ length: 4 }, (_, n) => `REV-2.${n + 1}`),
  ...Array.from({ length: 3 }, (_, n) => `REV-3.${n + 1}`),
  ...Array.from({ length: 7 }, (_, n) => `REV-4.${n + 1}`)
]
export interface ReleaseContext { revision: string, compatibleRevisions: string[], dirty: boolean }

// Artifact existence/digests are checked by the CLI before calling this pure evaluator.
// A passed report is evidence bookkeeping, NOT automatic deployment authorization.
export function evaluateRelease(tasks: Record<string, string>, evidence: Evidence, context: ReleaseContext, stage: Stage, now = Date.now()) {
  const blockers: string[] = []
  if (context.dirty) blockers.push('Working tree is dirty; commit/review the candidate before acceptance')
  if (!revisionSchema.safeParse(context.revision).success) blockers.push('Missing/invalid candidate revision')
  const requiredTasks = stage === 'local' ? prerequisites : [...prerequisites, 'REV-5.1', 'REV-5.2']
  for (const id of requiredTasks) if (tasks[id] !== 'done') blockers.push(`${id}: ${tasks[id] ?? 'missing'}`)
  const gates = GATES.filter(gate => ['local', 'predeploy', 'postdeploy'].indexOf(gate.stage) <= ['local', 'predeploy', 'postdeploy'].indexOf(stage)).map(gate => {
    const row = evidence.records.find(row => row.id === gate.id)
    const reasons: string[] = []
    if (!row || !['passed', 'accepted-risk'].includes(row.status)) reasons.push(row?.note ?? 'No completed evidence supplied')
    else {
      if (!context.compatibleRevisions.includes(row.revision!)) reasons.push('Evidence is stale or from a different implementation')
      if (Date.parse(row.observedAt!) > now) reasons.push('Observation is in the future')
      if (tiers.indexOf(row.tier!) < tiers.indexOf(gate.tier)) reasons.push(`Requires ${gate.tier} evidence, not ${row.tier}`)
      if (row.runtime!.node !== 'v22.22.0') reasons.push('Requires pinned Node v22.22.0')
      if (!/^3\.2\.(?:0|[1-9]\d*)(?:\+[\w.-]+)?$/.test(row.runtime!.surreal)) reasons.push('Requires exact stable SurrealDB 3.2.x version/build')
      for (const pkg of ['sdk', 'nuxt', 'sharp'] as const) if (!/^\d+\.\d+\.\d+(?:\+[\w.-]+)?$/.test(row.runtime![pkg])) reasons.push(`Requires exact ${pkg} version`)
      if (gate.id === 'linux-filesystem' && !/linux/i.test(row.runtime!.os)) reasons.push('Windows skips are not Linux filesystem acceptance')
      if (gate.id === 'mixed-load' && !row.profile) reasons.push('Requires explicit constrained resource/workload/latency profile')
      if (gate.stage !== 'local' && !row.operator) reasons.push('Requires named operator review/authorization')
      if (row.status === 'accepted-risk') {
        if (gate.stage === 'local' || gate.id === 'cutover-authorization') reasons.push('Risk cannot replace this mandatory gate')
        if (Date.parse(row.expiresAt!) <= now) reasons.push('Risk acceptance expired')
      }
    }
    if (reasons.length) blockers.push(`${gate.id}: ${reasons.join('; ')}`)
    return { ...gate, status: row?.status ?? 'pending', satisfied: reasons.length === 0, reasons }
  })
  return { stage, candidateRevision: context.revision, ready: blockers.length === 0, productionApproval: false, blockers, gates }
}

// Reads only the fixed handoff files or explicit sanitized evidence references.
// Never fetch a URL, execute a recorded command, load dotenv or touch app storage.
export async function readEvidenceFile(root: string, path: string, digest?: string): Promise<string> {
  if (!artifactPath.test(path) && !['docs/backend-hardening/progress.md', 'docs/backend-hardening/release-evidence.json'].includes(path)) throw new Error('Unsafe evidence path')
  const canonicalRoot = await realpath(root)
  let current = canonicalRoot
  const components = path.split('/')
  for (const [index, component] of components.entries()) {
    current = join(current, component)
    const stat = await lstat(current)
    if (stat.isSymbolicLink() || (index < components.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new Error('Evidence must be a regular file without symlink components')
  }
  const file = await open(current, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const limit = path.endsWith('release-evidence.json') ? 64 * 1024 : 512 * 1024
    if ((await file.stat()).size > limit) throw new Error('Evidence byte budget exceeded')
    const buffer = Buffer.alloc(limit + 1)
    let bytes = 0
    while (bytes < buffer.length) {
      const result = await file.read(buffer, bytes, buffer.length - bytes, null)
      if (!result.bytesRead) break
      bytes += result.bytesRead
    }
    if (bytes > limit) throw new Error('Evidence byte budget exceeded')
    const content = buffer.subarray(0, bytes)
    if (digest && createHash('sha256').update(content).digest('hex') !== digest) throw new Error('Evidence digest mismatch')
    return content.toString('utf8')
  } finally { await file.close() }
}
