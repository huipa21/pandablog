import { readFile, writeFile } from 'node:fs/promises'
import { Surreal } from 'surrealdb'
import { describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import { startFixture } from '../../scripts/backend-hardening/fixture'
import { assertMediaStorageCompatible, ensureMediaStorageVersion, MEDIA_STORAGE_VERSION, MEDIA_STORAGE_VERSION_KEY } from '../../server/utils/media-storage-migration'

// Only the guarded runner may enable this. No runtime config / .env lookup.
describe.skipIf(process.env.PB_BACKEND_FIXTURE !== '1')('real media startup preservation', () => {
  it('preserves synthetic media/settings/bytes for current, missing, old and corrupt markers; fresh setup reenters', async () => {
    vi.stubGlobal('createError', createError)
    const fixture = await startFixture({ enabled: process.env.PB_BACKEND_FIXTURE, binary: process.env.PB_BACKEND_SURREAL_BIN ?? '' })
    const db = new Surreal()
    try {
      await db.connect(`${fixture.endpoint.replace('http:', 'ws:')}/rpc`)
      await db.signin({ username: fixture.username, password: fixture.password })
      await db.use({ namespace: fixture.namespace, database: fixture.database })
      await assertMediaStorageCompatible(db) // entirely fresh target, no tables
      await db.query(`DEFINE TABLE OVERWRITE app_settings SCHEMALESS PERMISSIONS NONE;
        DEFINE INDEX IF NOT EXISTS app_settings_key ON app_settings FIELDS key UNIQUE;`)
      await assertMediaStorageCompatible(db)
      await ensureMediaStorageVersion(db)
      await ensureMediaStorageVersion(db)
      expect((await db.query<[Array<{value: string}>]>('SELECT `value` FROM app_settings;'))[0]?.[0]?.value).toBe(MEDIA_STORAGE_VERSION)
      const path = fixture.storage.path('original.bin')
      await writeFile(path, 'synthetic-media-sentinel', { flag: 'wx' })
      await db.query(`CREATE files:sentinel CONTENT { storage_path: 'original.bin', legacy_field: 'preserve' };
        CREATE app_settings:media CONTENT { key: 'media', value: { max_file_size_mb: 37 } };`)
      const before = await db.query('SELECT * FROM files; SELECT * FROM app_settings:media;')
      for (const marker of [MEDIA_STORAGE_VERSION, undefined, 'old-layout', { corrupt: true }]) {
        await db.query('DELETE app_settings WHERE key = $key;', { key: MEDIA_STORAGE_VERSION_KEY })
        if (marker !== undefined) await db.query('CREATE app_settings CONTENT {key: $key, value: $value};', { key: MEDIA_STORAGE_VERSION_KEY, value: marker })
        if (marker === MEDIA_STORAGE_VERSION) await ensureMediaStorageVersion(db)
        else await expect(ensureMediaStorageVersion(db)).rejects.toThrow(/preserved/)
        expect(await db.query('SELECT * FROM files; SELECT * FROM app_settings:media;')).toEqual(before)
        expect(await readFile(path, 'utf8')).toBe('synthetic-media-sentinel')
      }
      console.info(JSON.stringify({ evidence: 'REV-1.6-local-real-fixture', node: process.version, surreal: (await db.version()).version, sdk: '2.0.3' }))
    } finally { try { await db.close() } finally { await fixture.stop(); vi.unstubAllGlobals() } }
  }, 60_000)
})
