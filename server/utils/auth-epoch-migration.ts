import { queryDb, type useDb } from './db'
import { queryRows, recordIdPart, stringifyRecordId } from './surrealResult'
import { newAuthEpoch } from './users'

/** Bounded, idempotent legacy conversion. Interrupted pages retain assigned
 * epochs; cookies/devices without the new epoch deliberately reauthenticate.
 */
export async function ensureAuthEpochs(db: Awaited<ReturnType<typeof useDb>>): Promise<void> {
  let previousPage = ''
  while (true) {
    const rows = queryRows<{id: unknown}>(await queryDb(db,
      'SELECT id FROM users WHERE auth_epoch IS NONE LIMIT 100;', undefined,
      {retryOnReconnect: false, label: 'auth epoch migration page'}))
    if (!rows.length) return // completion is verified by an empty remaining page
    const ids = rows.map(row => stringifyRecordId(row.id))
    if (ids.some(id => !id.startsWith('users:') || id.length > 256)) throw new Error('Invalid auth migration record')
    const page = ids.join('|')
    if (page === previousPage) throw new Error('Auth epoch migration made no progress; startup remains refused')
    previousPage = page
    for (const row of rows) {
      await queryDb(db, 'UPDATE type::record($table, $id) SET auth_epoch = $authEpoch WHERE auth_epoch IS NONE;',
        {table: 'users', id: recordIdPart(stringifyRecordId(row.id), 'users'), authEpoch: newAuthEpoch()},
        {retryOnReconnect: false, label: 'auth epoch migration assignment'})
    }
  }
}
