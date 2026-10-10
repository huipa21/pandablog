import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatLegacyManifestWarning, inspectLegacyModuleManifest, LEGACY_MODULE_MANIFEST, listDisabledLegacyFlags } from '../../build/legacy-module-manifest'

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'pb-legacy-manifest-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
const write = (content: string) => writeFile(join(root, LEGACY_MODULE_MANIFEST), content)

describe('legacy module manifest warning', () => {
  it('reports nothing when no manifest exists', () => {
    expect(inspectLegacyModuleManifest(root)).toEqual({ found: false })
  })

  it('reports an all-enabled manifest as unused without listing disabled paths', async () => {
    await write(JSON.stringify({ $schema: './x.json', version: 1, modules: { analytics: { enabled: true, geoip: true }, editor: { blocks: { mermaid: true } } } }))
    const report = inspectLegacyModuleManifest(root)
    expect(report).toEqual({ found: true, unreadable: false, disabled: [] })
    const text = formatLegacyManifestWarning(report as Extract<typeof report, { found: true }>)
    expect(text).toContain('is no longer used')
    expect(text).not.toContain('disabled:')
  })

  it('lists every disabled path except the already-retired access-log switch', async () => {
    await write(JSON.stringify({ version: 1, modules: { analytics: { enabled: false }, users: { multiUser: false }, editor: { blocks: { mermaid: false } }, logs: { accessLogs: false } } }))
    const report = inspectLegacyModuleManifest(root)
    expect(report).toEqual({ found: true, unreadable: false, disabled: ['modules.analytics.enabled', 'modules.users.multiUser', 'modules.editor.blocks.mermaid'] })
    const text = formatLegacyManifestWarning(report as Extract<typeof report, { found: true }>)
    expect(text).toContain('    - modules.users.multiUser')
    expect(text).toContain('docs/feature-flags-simplification/operations.md')
  })

  it.each([['invalid JSON', '{ nope'], ['oversized file', `{"x":"${'a'.repeat(256 * 1024)}"}`]])('never throws for %s', async (_, content) => {
    await write(content)
    expect(inspectLegacyModuleManifest(root)).toEqual({ found: true, unreadable: true, disabled: [] })
  })

  it('bounds reported paths and recursion depth', () => {
    const wide = Object.fromEntries(Array.from({ length: 150 }, (_, index) => [`k${index}`, false]))
    expect(listDisabledLegacyFlags(wide)).toHaveLength(100)
    let deep: unknown = false
    for (let index = 0; index < 20; index++) deep = { [`d${index}`]: deep }
    expect(listDisabledLegacyFlags(deep)).toEqual([])
  })
})
