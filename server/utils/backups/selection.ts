import type { ExportTableSelection } from './surrealHttp'

/** Full/incremental DB snapshots omit access logs unless explicitly opted in. */
export function buildFullBackupSelection(
  allTables: readonly string[],
  includeAccessLogs: boolean
): ExportTableSelection | undefined {
  if (includeAccessLogs || !allTables.includes('access_logs')) return undefined
  return { tables: allTables.filter(table => table !== 'access_logs') }
}
