import { BoundedAdmission } from '../admission'

const readers = new BoundedAdmission({active: 8, waiting: 0, waitMs: 1}, 'Backup download')
// Cardinality is bounded by the eight admitted readers and one serialized delete.
const leases = new Map<string, number>()
const deleting = new Set<string>()
const keyFor = (id: string) => id.replace(/^backups:/, '')
export async function acquireSnapshotRead(id: string): Promise<() => void> {
  const release = await readers.acquire(), key = keyFor(id)
  if (deleting.has(key)) {release(); throw new Error('Backup snapshot is being deleted')}
  leases.set(key, (leases.get(key) ?? 0) + 1)
  let done = false
  return () => {
    if (done) return
    done = true
    const count = leases.get(key)! - 1
    if (count) leases.set(key, count)
    else leases.delete(key)
    release()
  }
}
export function snapshotHasReaders(id: string): boolean {return leases.has(keyFor(id))}
export function reserveSnapshotDeletion(id: string): () => void {
  const key = keyFor(id)
  if (leases.has(key) || deleting.has(key)) throw new Error('Backup snapshot has active download readers')
  deleting.add(key)
  return () => deleting.delete(key)
}
