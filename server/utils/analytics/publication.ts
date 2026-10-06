import { randomUUID } from 'node:crypto'
import type { Surreal } from 'surrealdb'
import { queryDb } from '../db'
import { isMissingAnalyticsTableError } from './tables'

/** A partial restore can combine raw events with unrelated old summaries.
 * Rotate one scalar authority and restart only the raw-backed history cursor;
 * old totals remain readable (flagged partial), but cannot authorize deletion.
 * This runs inside the restore owner's fence after additive schema repair.
 */
export async function invalidateAnalyticsPublication(db: Surreal) {
  try {
    await queryDb(db, 'INFO FOR TABLE analytics_publication;', {}, {label: 'analytics restore publication preflight', retry: 'readOnly'})
  } catch (error) {
    if (isMissingAnalyticsTableError(error, ['analytics_publication'])) return // disabled/legacy module, no verified epoch exists
    throw error
  }
  await queryDb(db, `BEGIN TRANSACTION;
    UPSERT analytics_publication:current SET epoch = $epoch RETURN NONE;
    DELETE analytics_checkpoint:rollup RETURN NONE;
    COMMIT TRANSACTION;`, {epoch: randomUUID()}, {label: 'invalidate restored analytics publication', retry: 'never'})
}
