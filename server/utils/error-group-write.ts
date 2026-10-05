import { queryDb, useDb } from './db'

// Regressed reads the OLD resolved_at before it is cleared. Every recurrence
// reopens the inbox, even if the group was merely marked read (not resolved).
export const ERROR_GROUP_UPSERT = `UPSERT type::record('error_groups', $fp) SET
  fingerprint = $fp, fingerprint_version = 1,
  name = IF last_seen = NONE OR last_seen <= $timestamp THEN ($name ?? NONE) ELSE name END,
  message = IF last_seen = NONE OR last_seen <= $timestamp THEN $message ELSE message END,
  route = IF last_seen = NONE OR last_seen <= $timestamp THEN ($route ?? NONE) ELSE route END,
  status_code = IF last_seen = NONE OR last_seen <= $timestamp THEN ($status ?? NONE) ELSE status_code END,
  level = IF last_seen = NONE OR last_seen <= $timestamp THEN $level ELSE level END,
  last_stack = IF last_seen = NONE OR last_seen <= $timestamp THEN ($stack ?? NONE) ELSE last_stack END,
  count = (count ?? 0) + $count,
  first_seen = first_seen ?? $timestamp, last_seen = IF last_seen = NONE OR last_seen < $timestamp THEN $timestamp ELSE last_seen END,
  regressed = IF resolved_at != NONE THEN true ELSE (regressed ?? false) END,
  read_at = NONE, resolved_at = NONE
RETURN NONE;`

const writes = new Map<string, Promise<void>>()

export function writeErrorGroup(entry: Record<string, unknown>, count: number, occurrence: boolean): Promise<void> {
  const fp = String(entry.fingerprint)
  const previous = writes.get(fp)
  const task = (previous ? previous.catch(() => {}).then(() => performWrite(entry, count, occurrence)) : performWrite(entry, count, occurrence)).finally(() => {
    if (writes.get(fp) === task) writes.delete(fp)
  })
  writes.set(fp, task)
  return task
}

export async function waitForErrorGroupWrites() {
  await Promise.allSettled([...writes.values()])
}

async function performWrite(entry: Record<string, unknown>, count: number, occurrence: boolean) {
  const db = await useDb()
  const { route: _route, ...occurrenceEntry } = entry
  const params = {
    fp: entry.fingerprint, name: entry.name ?? null, message: entry.message,
    route: entry.route ?? null, status: entry.status_code ?? null, level: entry.level,
    stack: entry.stack ?? null, timestamp: entry.timestamp, count, entry: occurrenceEntry
  }
  // A transaction keeps group increments and occurrence creation together.
  // Serialize same-process writes per fingerprint. A concurrent backfill or
  // admin action can still conflict; retry only explicit rollback/conflict
  // errors (the SDK can mask the root cause as 'failed transaction'), never
  // an ambiguous disconnect, which could double-count.
  for (let attempt = 0; ; attempt++) {
    try {
      await queryDb(db, `BEGIN TRANSACTION;\n${ERROR_GROUP_UPSERT}\n${occurrence ? 'CREATE error_logs CONTENT $entry RETURN NONE;' : ''}\nCOMMIT TRANSACTION;`, params,
        { label: 'log error group write', timeoutMs: 5_000, retryOnReconnect: false })
      return
    } catch (error) {
      if (attempt >= 4 || !/transaction.*(?:conflict|can be retried)|not complete.*transaction|not executed due to a failed transaction/i.test(String(error))) throw error
      await new Promise(resolve => setTimeout(resolve, 10 * 2 ** attempt + Math.random() * 10))
    }
  }
}
