import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtureEnvironment } from './fixture'
import { evaluateRelease, parseEvidence, parseTaskStatuses, readEvidenceFile, type Stage } from './release-readiness'

// This is intentionally a read-only evidence checker, not a test/deploy launcher.
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const args = process.argv.slice(2)
if (args.length !== 2 || !['--report', '--check'].includes(args[0]!) || !/^--stage=(local|predeploy|postdeploy)$/.test(args[1]!)) {
  throw new Error('Usage: tsx scripts/backend-hardening/release.ts --report|--check --stage=local|predeploy|postdeploy')
}
const stage = args[1]!.slice('--stage='.length) as Stage
const git = (...parameters: string[]) => execFileSync('git', parameters, {
  cwd: root, env: fixtureEnvironment(), encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024
}).trim()
const reportingPaths = [
  ':!docs/backend-hardening/evidence/**', ':!docs/backend-hardening/release-evidence.json',
  ':!docs/backend-hardening/progress.md', ':!docs/backend-hardening/findings.md',
  ':!docs/backend-hardening/operations.md', ':!docs/backend-hardening/release-handoff.md', ':!Readme.md'
]
try {
  const tasks = parseTaskStatuses(await readEvidenceFile(root, 'docs/backend-hardening/progress.md'))
  const evidence = parseEvidence(JSON.parse(await readEvidenceFile(root, 'docs/backend-hardening/release-evidence.json')))
  const revision = git('rev-parse', 'HEAD')
  const compatibleRevisions = [revision]
  for (const recorded of new Set(evidence.records.flatMap(row => row.revision ? [row.revision] : []))) {
    if (recorded === revision) continue
    try {
      // Only ancestors whose changes are exclusively handoff/reporting documents
      // can reuse evidence. Runtime/config/test/spec/tool changes require a rerun.
      git('merge-base', '--is-ancestor', recorded, revision)
      git('diff', '--quiet', recorded, revision, '--', '.', ...reportingPaths)
      compatibleRevisions.push(recorded)
    } catch { /* unknown/unrelated/changed implementation is stale */ }
  }
  const artifactErrors: string[] = []
  const checked = new Set<string>()
  for (const row of evidence.records) {
    for (const artifact of row.artifacts ?? []) {
      const key = `${artifact.path}:${artifact.sha256}`
      if (checked.has(key)) continue
      checked.add(key)
      try { await readEvidenceFile(root, artifact.path, artifact.sha256) }
      catch { artifactErrors.push(`${row.id}: missing/unsafe/oversized artifact or digest mismatch: ${artifact.path}`) }
    }
  }
  const result = evaluateRelease(tasks, evidence, { revision, compatibleRevisions, dirty: git('status', '--porcelain', '--untracked-files=normal') !== '' }, stage)
  result.blockers.push(...artifactErrors)
  result.ready = result.blockers.length === 0
  console.log(JSON.stringify(result, null, 2))
  if (args[0] === '--check' && !result.ready) process.exitCode = 1
} catch {
  // Do not echo unknown manifest bodies, Git diagnostics, env or credentials.
  console.error('Release evidence validation failed: check the ledger, manifest, Git candidate and bounded regular-file artifacts. No tests or deployment were run.')
  process.exitCode = 1
}
