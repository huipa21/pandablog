import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, access, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { startFixture } from '../../scripts/backend-hardening/fixture'

const faults = vi.hoisted(() => ({refresh: false}))
function mockSettings() {vi.doMock('../../server/utils/settings', async importOriginal => {
  const original = await importOriginal<typeof import('../../server/utils/settings')>()
  return {...original, initializeRuntimeSettings: async (...args: Parameters<typeof original.initializeRuntimeSettings>) => {
    if (faults.refresh) {faults.refresh = false; throw new Error('owned-fixture post-media refresh failure')}
    return original.initializeRuntimeSettings(...args)
  }}
})}

describe.skipIf(process.env.PB_BACKEND_FIXTURE !== '1')('real full restore worker on owned DB/media only', () => {
  it.each(['full', 'incremental', 'partial'] as const)('%s backup, streaming restore/rollback, credentials/epochs and historical variants', async kind => {
    vi.doUnmock('../../server/utils/settings'); vi.resetModules(); mockSettings()
    const schema = await readFile(fileURLToPath(new URL('../../server/utils/schema.surql', import.meta.url)), 'utf8')
    const fixture = await startFixture({enabled: process.env.PB_BACKEND_FIXTURE, binary: process.env.PB_BACKEND_SURREAL_BIN ?? ''})
    let dbModule: typeof import('../../server/utils/db') | undefined
    let root: Awaited<ReturnType<NonNullable<typeof dbModule>['connectRootClient']>> | undefined
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(fixture.storage.root)
    try {
      for (const [name, value] of Object.entries({__PB_MODULE_LOGS__: true, __PB_MODULE_ANALYTICS__: true, __PB_MODULE_BACKUPS__: true, useStorage: () => ({clear: async () => {}}), createError: (options: {message: string}) => Object.assign(new Error(options.message), options)})) vi.stubGlobal(name, value)
      const config = {surrealUrl: `${fixture.endpoint.replace('http:', 'ws:')}/rpc`, surrealRoot: fixture.username, surrealRootPassword: fixture.password, surrealNamespace: fixture.namespace, surrealDatabase: fixture.database, surrealAppUser: 'fixture_app', surrealAppPassword: 'owned-generated-scope-password', public: {}}
      vi.stubGlobal('useRuntimeConfig', () => config)
      // Static schema copy is test source, never configured storage or .env.
      await mkdir(join(fixture.storage.root, 'server/utils'), {recursive: true})
      await writeFile(join(fixture.storage.root, 'server/utils/schema.surql'), schema)
      dbModule = await import('../../server/utils/db')
      const {startBackupJob} = await import('../../server/utils/backups/create')
      const {startRestoreJob} = await import('../../server/utils/backups/restore')
      const {jobStore, getActiveJob} = await import('../../server/utils/backups/jobMutex')
      const {writeBarrier} = await import('../../server/utils/maintenance')
      const {getBackup} = await import('../../server/utils/backups/registry')
      root = await dbModule.connectRootClient()
      await dbModule.queryDb(root, schema, undefined, {timeoutMs: 30_000})
      await dbModule.provisionAppDatabaseUser(root)
      const epoch = 'a'.repeat(48)
      await dbModule.queryDb(root, `CREATE users:admin CONTENT {username: 'admin', password_hash: 'synthetic', role: 'superadmin', active: true, auth_epoch: $epoch};
        CREATE app_settings:layout CONTENT {key: '__media_storage_version', value: '2026-05-image-variants-v2'};
        CREATE app_settings:backup_options CONTENT {key: 'backups', value: {max_backups: 0, auto_safety_snapshot: true}};
        CREATE fixture_marker:retained SET title = 'base'; CREATE fixture_marker:deleted SET title = 'base';`, {epoch})
      const image = await sharp({create: {width: 16, height: 16, channels: 3, background: {r: 102, g: 153, b: 170}}}).png().toBuffer()
      const hash = createHash('sha256').update(image).digest('hex'), relative = `2020/01/${hash}.png`
      await mkdir(join(fixture.storage.root, 'storage/uploads/2020/01'), {recursive: true})
      await mkdir(join(fixture.storage.root, 'storage/variants'), {recursive: true})
      await writeFile(join(fixture.storage.root, 'storage/uploads', relative), image)
      await writeFile(join(fixture.storage.root, 'storage/variants/sentinel'), 'old-variants')
      await dbModule.queryDb(root, `CREATE files:picture CONTENT {hash: $hash, original_name: 'fixture.png', stored_name: $stored, mime_type: 'image/png', size: $size, extension: 'png', original_path: $path, is_image: true, variants: {}};`, {hash, stored: `${hash}.png`, size: image.length, path: relative})
      const base = await startBackupJob({type: 'full'})
      await vi.waitFor(() => expect(getActiveJob()).toBeNull(), {timeout: 30_000})
      expect((await getBackup(base))?.error).toBeNull()
      expect((await getBackup(base))?.status).toBe('ready')
      let target = base
      if (kind !== 'full') {
        await dbModule.queryDb(root, "DELETE fixture_marker:deleted; UPDATE fixture_marker:retained SET title = 'snapshot';")
        target = await startBackupJob({type: kind, parent: base, tables: kind === 'partial' ? ['fixture_marker'] : undefined})
        await vi.waitFor(() => expect(getActiveJob()).toBeNull(), {timeout: 30_000})
        expect((await getBackup(target))?.status).toBe('ready')
      }
      // The artifact holds the OLD DB-user password. The configured runtime
      // secret is rotated before restore and must be reprovisioned/reconnected.
      config.surrealAppPassword = 'owned-current-password-after-snapshot'
      await dbModule.provisionAppDatabaseUser(root)
      await dbModule.recycleRuntimeConnection()
      await dbModule.useDb()
      await dbModule.queryDb(root, "UPDATE fixture_marker:retained SET title = 'live-before-restore';")
      const oldCacheGeneration = writeBarrier.cacheGeneration()
      faults.refresh = kind === 'incremental' // actual DB + actual FS rollback after media swap
      const token = await startRestoreJob(target)
      expect(jobStore.authorizeStatus(token)).toBe(true)
      await vi.waitFor(() => expect(['committed', 'rolled-back', 'aborted', 'recovery-required']).toContain(jobStore.getJournal()?.state), {timeout: 60_000})
      expect(jobStore.getJournal()?.error).toBe(kind === 'incremental' ? 'owned-fixture post-media refresh failure' : undefined)
      await vi.waitFor(() => expect(getActiveJob()?.kind ?? null).toBeNull(), {timeout: 5_000})
      expect(writeBarrier.status().closed).toBe(false)
      expect(writeBarrier.cacheGeneration()).not.toBe(oldCacheGeneration)
      expect(jobStore.getJournal()?.state).toBe(kind === 'incremental' ? 'rolled-back' : 'committed')
      const rows = (await dbModule.queryDb(root, 'SELECT * FROM fixture_marker:retained;'))[0] as {title: string}[]
      expect(rows[0]?.title).toBe(kind === 'incremental' ? 'live-before-restore' : kind === 'partial' ? 'snapshot' : 'base')
      const account = (await dbModule.queryDb(root, 'SELECT auth_epoch FROM users:admin;'))[0] as {auth_epoch: string}[]
      expect(account[0]?.auth_epoch).not.toBe(epoch)
      const runtime = await dbModule.useDb()
      expect(await dbModule.queryDb(runtime, 'RETURN 1;')).toEqual([1])
      expect(await readFile(join(fixture.storage.root, 'storage/uploads', relative))).toEqual(image)
      if (kind === 'incremental') expect(await readFile(join(fixture.storage.root, 'storage/variants/sentinel'), 'utf8')).toBe('old-variants')
      else {
        const files = (await dbModule.queryDb(root, 'SELECT variants FROM files:picture;'))[0] as {variants: Record<string, {path: string}>}[]
        expect(files[0]?.variants.thumbnail?.path).toBe(`thumbnail/2020/01/${hash}.webp`)
        await access(join(fixture.storage.root, 'storage/variants', files[0]!.variants.thumbnail!.path))
      }
      const restoredBackup = await getBackup(target)
      expect(restoredBackup?.status).toBe('ready')
      if (kind === 'full') {
        const {importExternalBackup} = await import('../../server/utils/backups/importExternal')
        const source = join(fixture.storage.root, 'storage/backups', base)
        const dbGzPath = fixture.storage.path('external-db.gz'), mediaTarGzPath = fixture.storage.path('external-media.gz')
        await copyFile(join(source, 'db.surql.gz'), dbGzPath)
        await copyFile(join(source, 'media.tar.gz'), mediaTarGzPath)
        const imported = await importExternalBackup({dbGzPath, mediaTarGzPath, manifestBuffer: await readFile(join(source, 'manifest.json'))})
        expect((await getBackup(imported))?.status).toBe('ready')
      }
      process.stdout.write(JSON.stringify({evidence: 'REV-2.4-actual-worker-owned-DB-FS-not-Nitro-production', kind, state: jobStore.getJournal()?.state, node: process.version, sdk: '2.0.3', surreal: (await root.version()).version}) + '\n')
    } finally {
      faults.refresh = false
      if (dbModule) {await dbModule.closeRootClient(root); await dbModule.shutdownDb()}
      cwd.mockRestore(); vi.unstubAllGlobals(); await fixture.stop()
    }
  }, 120_000)
})
