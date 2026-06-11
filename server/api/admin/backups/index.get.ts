import { requireSuperadmin } from '../../../utils/auth'
import { listBackups, getDirectDescendants } from '../../../utils/backups/registry'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  const snapshots = await listBackups()

  // Attach descendant_count for UI (chain visualization)
  const counts = new Map<string, number>()
  for (const s of snapshots) {
    const desc = await getDirectDescendants(s.id).catch(() => [])
    counts.set(s.id, desc.length)
  }

  return snapshots.map((s) => ({
    ...s,
    descendant_count: counts.get(s.id) ?? 0,
  }))
})
