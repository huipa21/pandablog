import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir, hostname } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { archiveReviewedStartup, inspectRecovery } from '../../scripts/recovery/assistant'

const confirmations = {appStopped: true, databaseQuiescent: true, dataConsistent: true}
const receipt = {token: 'a'.repeat(48), generation: 'b'.repeat(48), host: hostname(), pid: 2147483647}
async function fixture(work: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'pb-recovery-tool-'))
  try {await mkdir(join(root, 'backups')); await work(root)} finally {await rm(root, {recursive: true, force: true})}
}
async function records(root: string) {
  await mkdir(join(root, 'backups/.writer.lock'))
  await writeFile(join(root, 'backups/.writer.lock/owner.json'), JSON.stringify(receipt))
  await writeFile(join(root, 'backups/.uncertain-writes.json'), JSON.stringify({version: 1, generation: receipt.generation, updatedAt: new Date().toISOString()}))
}
const exists = (path: string) => stat(path).then(() => true, () => false)

describe('local reviewed startup recovery assistant (owned storage; no DB)', () => {
  it('read-only inspection explains legacy ambiguity without exposing tokens or editing markers', () => fixture(async root => {
    await records(root)
    const before = await readFile(join(root, 'backups/.uncertain-writes.json'), 'utf8')
    const report = await inspectRecovery(root)
    expect(report).toMatchObject({status: 'review-required', canArchiveReviewedStartup: true})
    expect(report.findings.join(' ')).toContain('does not block startup')
    expect(JSON.stringify(report)).not.toContain(receipt.token)
    expect(JSON.stringify(report)).not.toContain(receipt.generation)
    expect(await readFile(join(root, 'backups/.uncertain-writes.json'), 'utf8')).toBe(before)
    expect(await exists(join(root, '.recovery-archive'))).toBe(false)
  }))
  it('requires every explicit confirmation and archives exact records without deleting data', () => fixture(async root => {
    await records(root)
    await mkdir(join(root, 'uploads')); await writeFile(join(root, 'uploads/original.bin'), 'original-data')
    await writeFile(join(root, 'setup-authority.json'), 'must-be-preserved')
    for (const key of Object.keys(confirmations)) await expect(archiveReviewedStartup(root, {...confirmations, [key]: false})).rejects.toThrow('All recovery confirmations')
    const destination = await archiveReviewedStartup(root, confirmations)
    expect(JSON.parse(await readFile(join(destination, '.writer.lock/owner.json'), 'utf8'))).toEqual(receipt)
    expect(await exists(join(destination, '.uncertain-writes.json'))).toBe(true)
    expect(JSON.parse(await readFile(join(destination, 'review.json'), 'utf8'))).toMatchObject({kind: 'operator-reviewed-startup-archival', confirmations})
    expect(await exists(join(root, 'backups/.writer.lock'))).toBe(false)
    expect(await exists(join(root, 'backups/.uncertain-writes.json'))).toBe(false)
    expect(await exists(join(root, 'backups/.ownership.guard'))).toBe(false)
    expect(await readFile(join(root, 'uploads/original.bin'), 'utf8')).toBe('original-data')
    expect(await readFile(join(root, 'setup-authority.json'), 'utf8')).toBe('must-be-preserved')
    expect((await inspectRecovery(root)).status).toBe('clear')
  }))
  it.each([false, true])('allows explicitly reviewed archival of an empty writer directory (uncertainty=%s), never inferring a dead owner', withUncertainty => fixture(async root => {
    await mkdir(join(root, 'backups/.writer.lock'))
    if (withUncertainty) await writeFile(join(root, 'backups/.uncertain-writes.json'), JSON.stringify({version: 1, generation: receipt.generation, updatedAt: new Date().toISOString()}))
    const report = await inspectRecovery(root)
    expect(report).toMatchObject({status: 'review-required', canArchiveReviewedStartup: true})
    expect(report.findings.join(' ')).toContain('owner.json is missing')
    expect(report.findings.join(' ')).toContain('cannot be determined')
    expect(report.findings.join(' ')).not.toContain('dead local writer')
    expect(await exists(join(root, '.recovery-archive'))).toBe(false)
    for (const key of Object.keys(confirmations)) await expect(archiveReviewedStartup(root, {...confirmations, [key]: false})).rejects.toThrow('All recovery confirmations')
    const destination = await archiveReviewedStartup(root, confirmations)
    expect(await exists(join(destination, '.writer.lock'))).toBe(true)
    expect(await exists(join(destination, '.writer.lock/owner.json'))).toBe(false)
    expect(await exists(join(destination, '.uncertain-writes.json'))).toBe(withUncertainty)
    expect(JSON.parse(await readFile(join(destination, 'review.json'), 'utf8'))).toMatchObject({emptyWriterDirectory: true, confirmations})
    expect(await exists(join(root, 'backups/.writer.lock'))).toBe(false)
    expect((await inspectRecovery(root)).status).toBe('clear')
  }))
  it('still refuses an empty directory when a publication guard exists', () => fixture(async root => {
    await mkdir(join(root, 'backups/.writer.lock'))
    await mkdir(join(root, 'backups/.ownership.guard'))
    expect((await inspectRecovery(root)).canArchiveReviewedStartup).toBe(false)
    await expect(archiveReviewedStartup(root, confirmations)).rejects.toThrow('not eligible')
    expect(await exists(join(root, 'backups/.ownership.guard'))).toBe(true)
    expect(await exists(join(root, 'backups/.writer.lock'))).toBe(true)
  }))
  it('does not confuse partial publication with an empty directory', () => fixture(async root => {
    await mkdir(join(root, 'backups/.writer.lock'))
    await writeFile(join(root, 'backups/.writer.lock/owner.json.tmp'), 'partial-owner-content')
    expect((await inspectRecovery(root)).canArchiveReviewedStartup).toBe(false)
    await expect(archiveReviewedStartup(root, confirmations)).rejects.toThrow('not eligible')
    expect(await readFile(join(root, 'backups/.writer.lock/owner.json.tmp'), 'utf8')).toBe('partial-owner-content')
  }))
  it.each(['.restore-journal.json', '.restore-owned', '.job.lock', '.ownership.guard'])('refuses archival with %s and leaves all records intact', name => fixture(async root => {
    await records(root)
    if (name.endsWith('.json')) await writeFile(join(root, 'backups', name), JSON.stringify({state: 'recovery-required', destructive: true}))
    else await mkdir(join(root, 'backups', name))
    expect((await inspectRecovery(root)).canArchiveReviewedStartup).toBe(false)
    await expect(archiveReviewedStartup(root, confirmations)).rejects.toThrow('not eligible')
    expect(await exists(join(root, 'backups', name))).toBe(true)
    expect(await exists(join(root, 'backups/.writer.lock'))).toBe(true)
    expect(await exists(join(root, '.recovery-archive'))).toBe(false)
  }))
  it.each(['remote', 'malformed'])('refuses %s ownership', kind => fixture(async root => {
    await records(root)
    const writerPath = join(root, 'backups/.writer.lock/owner.json')
    if (kind === 'live') await writeFile(writerPath, JSON.stringify({...receipt, pid: process.pid}))
    if (kind === 'remote') await writeFile(writerPath, JSON.stringify({...receipt, host: 'other-host.invalid'}))
    if (kind === 'malformed') await writeFile(writerPath, '{')
    if (kind === 'different-generation') await writeFile(writerPath, JSON.stringify({...receipt, generation: 'c'.repeat(48)}))
    if (kind === 'unknown-uncertainty') await writeFile(join(root, 'backups/.uncertain-writes.json'), JSON.stringify({version: 99}))
    const before = await readFile(writerPath, 'utf8')
    expect((await inspectRecovery(root)).status).toBe('manual-recovery-required')
    await expect(archiveReviewedStartup(root, confirmations)).rejects.toThrow('not eligible')
    expect(await readFile(writerPath, 'utf8')).toBe(before)
  }))
  it('treats a live writer with a pending uncertain-write window as normal, never archivable', () => fixture(async root => {
    await records(root)
    const writerPath = join(root, 'backups/.writer.lock/owner.json')
    await writeFile(writerPath, JSON.stringify({...receipt, pid: process.pid}))
    const before = await readFile(writerPath, 'utf8')
    expect(await inspectRecovery(root)).toMatchObject({status: 'writer-active', canArchiveReviewedStartup: false, blockers: []})
    await expect(archiveReviewedStartup(root, confirmations)).rejects.toThrow('not eligible')
    expect(await readFile(writerPath, 'utf8')).toBe(before)
  }))
  it.each(['different-generation', 'unknown-uncertainty'])('does not let %s uncertainty block reviewed writer archival', kind => fixture(async root => {
    await records(root)
    const writerPath = join(root, 'backups/.writer.lock/owner.json')
    if (kind === 'different-generation') await writeFile(writerPath, JSON.stringify({...receipt, generation: 'c'.repeat(48)}))
    if (kind === 'unknown-uncertainty') await writeFile(join(root, 'backups/.uncertain-writes.json'), JSON.stringify({version: 99}))
    const report = await inspectRecovery(root)
    expect(report).toMatchObject({status: 'review-required', canArchiveReviewedStartup: true, blockers: []})
    expect(report.findings.join(' ')).toContain('does not block startup')
  }))
  it('reports an uncertain-write marker alone as clear (the application clears it itself)', () => fixture(async root => {
    await mkdir(join(root, 'backups'), {recursive: true})
    await writeFile(join(root, 'backups/.uncertain-writes.json'), JSON.stringify({version: 1, generation: receipt.generation, updatedAt: new Date().toISOString()}))
    expect(await inspectRecovery(root)).toMatchObject({status: 'clear', canArchiveReviewedStartup: false, blockers: []})
  }))
  it('treats normal live ownership without recovery markers as informational, never as a recovery request', () => fixture(async root => {
    await mkdir(join(root, 'backups/.writer.lock'))
    const path = join(root, 'backups/.writer.lock/owner.json')
    const raw = JSON.stringify({...receipt, pid: process.pid})
    await writeFile(path, raw)
    const report = await inspectRecovery(root)
    expect(report).toMatchObject({status: 'writer-active', canArchiveReviewedStartup: false, blockers: []})
    expect(report.message).toContain('no recovery marker')
    expect(report.message).toContain('does not prove readiness')
    await expect(archiveReviewedStartup(root, confirmations)).rejects.toThrow('not eligible')
    expect(await readFile(path, 'utf8')).toBe(raw)
    expect(await exists(join(root, '.recovery-archive'))).toBe(false)
  }))
  it('two reviewed contenders cannot archive the same receipts twice', () => fixture(async root => {
    await records(root)
    const results = await Promise.allSettled([archiveReviewedStartup(root, confirmations), archiveReviewedStartup(root, confirmations)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect((await inspectRecovery(root)).status).toBe('clear')
  }))
  it('refuses symlinked backup roots and preserves the target', () => fixture(async root => {
    const target = join(root, 'other'); await mkdir(target)
    await rm(join(root, 'backups'), {recursive: true})
    await symlink(target, join(root, 'backups'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(inspectRecovery(root)).rejects.toThrow('regular directories')
    expect(await exists(target)).toBe(true)
  }))
  it.each(['inspect', 'expert-without-assertions'])('actual CLI %s never asks users technical verification questions or loads secrets', async mode => {
    const cwd = await mkdtemp(join(tmpdir(), 'pb-recovery-cli-'))
    try {
      await mkdir(join(cwd, 'storage/backups'), {recursive: true})
      await records(join(cwd, 'storage'))
      await writeFile(join(cwd, '.env'), 'NUXT_SURREAL_ROOT_PASSWORD=must-not-read-or-echo\nNUXT_SURREAL_URL=ws://must-not-contact.invalid/rpc\n')
      const script = join(process.cwd(), 'scripts/recover.ts')
      const loader = pathToFileURL(join(process.cwd(), 'node_modules/tsx/dist/loader.mjs')).href
      const args = mode === 'inspect' ? [] : ['--archive-reviewed-startup']
      const child = spawn(process.execPath, ['--import', loader, script, ...args], {cwd, env: {...process.env}, stdio: ['ignore', 'pipe', 'pipe']})
      let output = ''
      for (const stream of [child.stdout!, child.stderr!]) stream.on('data', bytes => {output += bytes.toString()})
      const code = await new Promise<number | null>((resolve, reject) => {child.on('close', resolve); child.on('error', reject)})
      expect(code, output).toBe(mode === 'inspect' ? 0 : 1)
      expect(output).toContain('review-required')
      expect(output).not.toContain('Type yes:')
      if (mode !== 'inspect') expect(output).toContain('expert-only')
      expect(output).not.toMatch(/must-not-read-or-echo|must-not-contact|a{48}|b{48}/)
      expect(await exists(join(cwd, 'storage/backups/.uncertain-writes.json'))).toBe(true)
      expect(await exists(join(cwd, 'storage/.recovery-archive'))).toBe(false)
    } finally {await rm(cwd, {recursive: true, force: true})}
  })
})
