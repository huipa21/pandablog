import type { Surreal } from 'surrealdb'
import { BoundedAdmission } from './admission'
import { queryDb } from './db'
import { firstRow } from './surrealResult'
// Conservative per-process publication serialization also serializes equal
// hashes; finite queue/key lifetime, no unbounded keyed promise map.
export const mediaPublicationAdmission = new BoundedAdmission({active: 1, waiting: 4, waitMs: 30_000}, 'Media publication')
/** Caller holds the publication lease throughout DB export and media packing. */
export async function assertMediaSnapshotReady(db: Surreal) {
  const pending = firstRow(await queryDb(db, "SELECT id FROM files WHERE storage_state IN ['publishing', 'deleting'] OR (storage_state = 'ready' AND storage_claim != NONE) LIMIT 1 TIMEOUT 5s;", {}, {retry: 'never'}))
  if (pending) throw new Error('Media publication/deletion recovery required before snapshot')
}
