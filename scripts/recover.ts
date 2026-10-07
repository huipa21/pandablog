import { resolve } from 'node:path'
import { archiveReviewedStartup, inspectRecovery, RecoveryRefusal } from './recovery/assistant'

async function main() {
  const args = process.argv.slice(2)
  const allowed = new Set(['--help', '--archive-reviewed-startup', '--app-stopped', '--database-quiescent', '--data-consistent'])
  if (args.some(arg => !allowed.has(arg))) throw new RecoveryRefusal('Unknown option. Run npm run recover -- --help')
  if (args.includes('--help')) {
    console.info(`PandaBlog local recovery assistant

npm run recover
  Read-only inspection of this project's storage/backups. No DB connection.

Normal use:
  No technical verification questions are asked. An active writer without a
  recovery marker is normal; check /api/ready. Configuration and verified
  pre-mutation sign-in failures need correction and restart, not recovery.

Expert-only archival of independently reviewed startup-only receipts:
  npm run recover -- --archive-reviewed-startup --app-stopped --database-quiescent --data-consistent
  The last three flags are expert assertions, NOT automated verification.
  Do not use them if you cannot establish the facts. No restore/import SQL
  is attempted. Unknown legacy records cannot be automatically certified.

A completely empty writer directory may be archived only after the same
explicit external review: its former owner cannot be identified automatically.
Interrupted restores, live/remote/nonempty-corrupt ownership, mismatched
generations and unrecognized markers are refused. No force/unfence option exists.
Run from the PandaBlog project root. No .env values or owner tokens are shown.`)
    return
  }
  const storage = resolve('storage')
  const report = await inspectRecovery(storage)
  console.info(`\nPandaBlog recovery: ${report.status}\n${report.message}`)
  for (const finding of report.findings) console.info(`- ${finding}`)
  for (const blocker of report.blockers) console.info(`BLOCKED: ${blocker}`)
  if (!args.includes('--archive-reviewed-startup')) {
    if (report.canArchiveReviewedStartup) console.info('\nNo automatic repair is available for these legacy records. Do not guess at database consistency. An administrator can use the expert-only archival options in --help after establishing the missing evidence.')
    return
  }
  if (report.status === 'writer-active') throw new RecoveryRefusal('No recovery is indicated by these records. Keep the running writer intact and check /api/ready.')
  if (!report.canArchiveReviewedStartup) throw new RecoveryRefusal('Startup-only archival is not available for these records. Preserve them and follow docs/backend-hardening/operations.md#offline-recovery-no-public-unfence-endpoint')
  const confirmations = {appStopped: args.includes('--app-stopped'), databaseQuiescent: args.includes('--database-quiescent'), dataConsistent: args.includes('--data-consistent')}
  if (!Object.values(confirmations).every(Boolean)) throw new RecoveryRefusal('Archival is an expert-only action and requires all three independently established assertions. No verification questions will be asked. Do not supply flags for facts you cannot establish; use --help for details.')
  const destination = await archiveReviewedStartup(storage, confirmations)
  console.info(`\nReviewed receipts preserved at ${destination}\nNo database or media data was modified. Correct configuration, start one PandaBlog instance, and verify GET /api/ready returns 200.`)
}
main().catch(error => {
  // Do not print arbitrary filesystem errors, receipt contents or nested causes.
  if (error instanceof RecoveryRefusal) console.error(error.message)
  console.error('Recovery action did not complete. No database operation was attempted. Preserve any recovery archive and rerun read-only inspection; use --help for prerequisites.')
  process.exitCode = 1
})
