import { existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERED_COMPONENTS = [
  'NodeImage', 'NodeCodeBlock', 'NodeDiffBlock', 'NodeMermaid', 'NodeBlockMath', 'NodeRubyUnit', 'NodeInlineMath',
  'NodeAnnotationBlock', 'NodeCustomHtml', 'NodeVideoEmbed', 'NodeMediaText', 'NodeFilesBlock', 'NodeColumnsBlock', 'NodeTabsBlock',
  'NodeDialogueBlock', 'NodeAccordionBlock', 'NodeQuoteBlock', 'NodeFootnotesBlock'
]
// Production sources only; tests/docs/backend-hardening legitimately mention retired names.
const PRODUCTION_PATHS = ['components', 'composables', 'layouts', 'middleware', 'modules', 'pages', 'plugins', 'server', 'utils', 'types', 'build', 'nuxt.config.ts', 'Dockerfile', 'package.json']
const FORBIDDEN = [/__PB_(?:MODULE|BLOCK)_/, /utils\/moduleFlags|useModuleFlags|pandablog-modules/, /public\.modules/]
const RETIRED_FILES = ['modules/feature-flags.ts', 'build/pandablog-modules.ts', 'utils/moduleFlags.ts', 'composables/useModuleFlags.ts',
  'types/module-flags.d.ts', 'pandablog.modules.json', 'pandablog.modules.json.example', 'scripts/configure-modules.ts', 'scripts/print-modules.ts',
  'components/admin/editor/DisabledDialogueBlockNodeView.vue']

async function productionFiles(): Promise<string[]> {
  const files: string[] = []
  for (const path of PRODUCTION_PATHS) {
    if (!existsSync(path)) continue
    if (!(await stat(path)).isDirectory()) { files.push(path); continue }
    for (const entry of await readdir(path, { recursive: true, withFileTypes: true })) {
      const file = join(entry.parentPath, entry.name)
      if (entry.isFile() && !file.includes('node_modules') && /\.(?:ts|vue|json|mjs)$/.test(file)) files.push(file)
    }
  }
  return files
}

describe('feature flags retired', () => {
  it('renders every block type regardless of authoring options', async () => {
    const source = await readFile('components/content/ContentRenderer.vue', 'utf8')
    expect(source).not.toMatch(/__PB_/)
    expect(source).not.toMatch(/disabledBlockTypes|isDisabledKnownBlock|disabled-content-block/)
    for (const component of RENDERED_COMPONENTS) {
      expect(source).toMatch(new RegExp(`const ${component} = defineAsyncComponent\\(`))
      expect(source).toMatch(new RegExp(`<${component} v-else-if="node\\.type === '`))
    }
    expect(source).toMatch(/<hr v-else-if="node\.type === 'horizontalRule'"/)
  })

  // Filesystem scan of ~1k files: explicit budget so full-concurrency runs are not flaky.
  it('has no build-time feature flag constants, readers or manifest tooling in production sources', { timeout: 30_000 }, async () => {
    const files = await productionFiles()
    expect(files.length).toBeGreaterThan(100)
    const offenders: string[] = []
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      for (const pattern of FORBIDDEN) if (pattern.test(source)) offenders.push(`${file}: ${pattern}`)
    }
    expect(offenders).toEqual([])
    for (const file of RETIRED_FILES) expect(existsSync(file), file).toBe(false)
    const scripts = JSON.parse(await readFile('package.json', 'utf8')).scripts as Record<string, string>
    expect(scripts).not.toHaveProperty('configure')
    expect(scripts).not.toHaveProperty('modules:print')
  })
})
