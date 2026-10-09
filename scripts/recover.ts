import { resolve } from 'node:path'
import { inspectRecovery, RecoveryRefusal } from './recovery/assistant'

async function main() {
  const args = process.argv.slice(2)
  if (args.some(arg => ['--archive-reviewed-startup', '--app-stopped', '--database-quiescent', '--data-consistent'].includes(arg))) throw new RecoveryRefusal('Startup archival flags are retired. Ordinary restart requires no writer receipt cleanup. Run panda recover for read-only restore inspection. No files were changed.')
  if (args.some(arg => arg !== '--help')) throw new RecoveryRefusal('Unknown option. Run panda recover --help')
  if (args.includes('--help')) {console.info('PandaBlog read-only restore inspection. Run: panda recover --help'); return}
  const report = await inspectRecovery(resolve('storage'))
  console.info(`\nPandaBlog recovery: ${report.status}\n${report.message}`)
  for (const finding of report.findings) console.info(`- ${finding}`)
  for (const blocker of report.blockers) console.info(`BLOCKED: ${blocker}`)
}
main().catch(error => {
  if (error instanceof RecoveryRefusal) console.error(error.message)
  console.error('Inspection or invocation failed. No database or filesystem mutation was attempted. Preserve restore evidence; see panda recover --help.')
  process.exitCode = 1
})
