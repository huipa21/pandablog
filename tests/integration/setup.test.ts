import { readFile } from 'node:fs/promises'
import { Surreal } from 'surrealdb'
import { describe, expect, it, vi } from 'vitest'
import { startFixture } from '../../scripts/backend-hardening/fixture'
import { createSetupOwner, SetupAuthority } from '../../server/utils/setup-authority'
const owned = vi.hoisted(() => ({db: null as Surreal | null}))
vi.mock('../../server/utils/db', () => ({useDb: async () => owned.db, queryDb: (db: Surreal, sql: string, params?: Record<string, unknown>) => db.query(sql, params)}))
vi.mock('../../server/utils/backups/jobMutex', () => ({getActiveJob: () => null}))

describe.skipIf(process.env.PB_BACKEND_FIXTURE !== '1')('real atomic bootstrap and durable authority', () => {
  it('two DB claimants cannot overwrite winner; lost response/empty restore/legacy evidence never reopen bootstrap', async () => {
    const fixture = await startFixture({enabled: process.env.PB_BACKEND_FIXTURE, binary: process.env.PB_BACKEND_SURREAL_BIN ?? ''})
    const db = new Surreal(); owned.db = db
    try {
      await db.connect(`${fixture.endpoint.replace('http:', 'ws:')}/rpc`)
      await db.signin({username: fixture.username, password: fixture.password})
      await db.use({namespace: fixture.namespace, database: fixture.database})
      const raw = await readFile('server/utils/schema.surql', 'utf8')
      await db.query(raw.slice(raw.indexOf('DEFINE TABLE OVERWRITE users'), raw.indexOf('-- ============ TRUSTED DEVICES')))
      await db.query('DEFINE TABLE app_settings SCHEMALESS; DEFINE INDEX settings_key ON app_settings FIELDS key UNIQUE;')
      const authority = new SetupAuthority(fixture.storage.path('setup.json'), fixture.storage.path('absent-lock'))
      const reservation = await authority.reserve(db)
      const competitor = {claim: 'b'.repeat(48), epoch: 'c'.repeat(48)}
      const results = await Promise.allSettled([createSetupOwner(db, 'winner-or-loser-a', reservation), createSetupOwner(db, 'winner-or-loser-b', competitor)])
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.statusCode).toBe(409)
      const before = await db.query('SELECT password_hash, auth_epoch FROM users:admin;')
      await expect(createSetupOwner(db, 'must-not-overwrite', competitor)).rejects.toMatchObject({statusCode: 409})
      expect(await db.query('SELECT password_hash, auth_epoch FROM users:admin;')).toEqual(before)
      // The file reservation belongs to claimant A. If B won the deliberate
      // DB-only race, mismatched receipt is recovery-required, never rewritten.
      const restarted = new SetupAuthority(fixture.storage.path('setup.json'), fixture.storage.path('absent-lock'))
      const committed = results[0]!.status === 'fulfilled'
      expect(await restarted.status(db)).toMatchObject({completed: true, recoveryRequired: !committed})
      await db.query('DELETE users; DELETE app_settings;') // owned synthetic DB only
      expect(await restarted.status(db)).toEqual({completed: true, recoveryRequired: true})
      await expect(restarted.reserve(db)).rejects.toMatchObject({statusCode: 503})
      const legacy = new SetupAuthority(fixture.storage.path('legacy-setup.json'), fixture.storage.path('absent-lock'))
      await db.query("CREATE app_settings:legacy CONTENT {key: 'setup_completed', value: true};")
      expect(await legacy.status(db)).toEqual({completed: true, recoveryRequired: true})
      await expect(legacy.reserve(db)).rejects.toMatchObject({statusCode: 503})
      process.stdout.write(JSON.stringify({evidence: 'REV-1.2-local-real-setup-SQL-and-owned-receipt-not-production', node: process.version, surreal: (await db.version()).version, sdk: '2.0.3'}) + '\n')
    } finally {owned.db = null; try {await db.close()} finally {await fixture.stop()}}
  }, 60_000)
})
