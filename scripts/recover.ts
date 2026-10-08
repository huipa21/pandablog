import { resolve } from 'node:path'
import { archiveReviewedStartup, inspectRecovery, RecoveryRefusal } from './recovery/assistant'

async function main() {
  const args = process.argv.slice(2)
  const allowed = new Set(['--help', '--archive-reviewed-startup', '--app-stopped', '--database-quiescent', '--data-consistent'])
  if (args.some(arg => !allowed.has(arg))) throw new RecoveryRefusal('Unknown option. Run panda recover --help')
  if (args.includes('--help')) {
    // Full documentation lives in the single operator CLI: bin/panda.mjs.
    console.info('PandaBlog offline recovery assistant. Run: panda recover --help')
    return
  }
  const storage = resolve('storage')
  const report = await inspectRecovery(storage)
  console.info(`\nPandaBlog recovery: ${report.status}\n${report.message}`)
  for (const finding of report.findings) console.info(`- ${finding}`)
  for (const blocker of report.blockers) console.info(`BLOCKED: ${blocker}`)
  if (!args.includes('--archive-reviewed-startup')) {
    if (report.canArchiveReviewedStartup) console.info('\nNo automatic repair is available for these legacy records. Do not guess at database consistency. An administrator can use the expert-only archival options in panda recover --help after establishing the missing evidence.')
    return
  }
  if (report.status === 'writer-active') throw new RecoveryRefusal('No recovery is indicated by these records. Keep the running writer intact and check /api/ready.')
  if (!report.canArchiveReviewedStartup) throw new RecoveryRefusal('Startup-only archival is not available for these records. Preserve them and follow docs/backend-hardening/operations.md#offline-recovery-no-public-unfence-endpoint')
  const confirmations = {appStopped: args.includes('--app-stopped'), databaseQuiescent: args.includes('--database-quiescent'), dataConsistent: args.includes('--data-consistent')}
  if (!Object.values(confirmations).every(Boolean)) throw new RecoveryRefusal('Archival is an expert-only action and requires all three independently established assertions. No verification questions will be asked. Do not supply flags for facts you cannot establish; see panda recover --help.')
  const destination = await archiveReviewedStartup(storage, confirmations)
  console.info(`\nReviewed receipts preserved at ${destination}\nNo database or media data was modified. Correct configuration, start one PandaBlog instance, and verify GET /api/ready returns 200.`)
}
main().catch(error => {
  // Do not print arbitrary filesystem errors, receipt contents or nested causes.
  if (error instanceof RecoveryRefusal) console.error(error.message)
  console.error('Recovery action did not complete. No database operation was attempted. Preserve any recovery archive and rerun read-only inspection (panda recover); see panda recover --help for prerequisites.')
  process.exitCode = 1
})
