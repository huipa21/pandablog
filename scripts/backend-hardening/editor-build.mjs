// Explicit owned-source production build: never loads configured .env or data.
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, mkdir, copyFile, lstat, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

if (process.argv.slice(2).join(' ') !== '--fixture' || process.version !== 'v22.22.0') throw new Error('Use Node 22.22.0 and --fixture')
const source = process.cwd(), root = await mkdtemp(join(tmpdir(), 'pb-editor-build-')), token = randomBytes(24).toString('hex')
await writeFile(join(root, '.owner'), token, { flag: 'wx' })
const extra = ['utils/blockPresentation.ts', 'utils/contentImage.ts', 'utils/contentBlockWidth.ts', 'composables/editor/useCodeTheme.ts', 'assets/css/block-presentation.css', 'assets/css/columns-block.css', 'assets/css/quote-block.css', 'tests/unit/editor-inserter.test.ts', 'tests/unit/block-presentation.test.ts', 'tests/unit/content-image.test.ts', 'tests/unit/editor-presentation-browser.test.ts', 'tests/unit/editor-settings.test.ts', 'tests/unit/emptyBlocks.test.ts', 'tests/e2e/dark-mode-rendering.spec.ts']
const files = [...new Set([...execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean), ...extra])]
const env = {}
for (const [key, value] of Object.entries(process.env)) if (/^(path|systemroot|windir|comspec|pathext|temp|tmp|lang)$/i.test(key)) env[key] = value
Object.assign(env, { NODE_ENV: 'production', APP_VERSION: 'editor-fixture.dirty', NUXT_SESSION_PASSWORD: randomBytes(32).toString('hex'), NUXT_APP_ORIGIN: 'http://127.0.0.1:31999', NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY: 'false' })
let diagnostic = '', timedOut = false, linked = false
try {
  for (const file of files) {
    if (/(^|\/)(?:\.env(?:\.|$)|storage\/|app-storage\/)/.test(file) || /^(?:\.git\/|node_modules\/|\.nuxt\/|\.output\/|public\/uploads\/|test-results\/)/.test(file) || file.endsWith('.pem')) continue
    if (file.split('/').includes('..')) throw new Error('Unsafe source path')
    const stat = await lstat(join(source, file))
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe source file')
    await mkdir(dirname(join(root, file)), { recursive: true })
    await copyFile(join(source, file), join(root, file))
  }
  await symlink(join(source, 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  linked = true
  const child = spawn(process.execPath, [join(source, 'node_modules/@nuxt/cli/bin/nuxi.mjs'), 'build', '--dotenv=false'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const pipe of [child.stdout, child.stderr]) pipe.on('data', bytes => { diagnostic = (diagnostic + bytes).slice(-15000) })
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, 210000)
  let code
  try { code = await new Promise((yes, no) => { child.once('error', no); child.once('close', yes) }) } finally { clearTimeout(timer) }
  console.log(diagnostic)
  console.log(JSON.stringify({ evidence: 'owned-source-production-build-no-db-app-or-dotenv', node: process.version, code, timedOut }))
  if (code !== 0) process.exitCode = 1
} finally {
  await cleanup()
}
async function cleanup() {
  if (await readFile(join(root, '.owner'), 'utf8') !== token) throw new Error('Fixture ownership lost; directory preserved')
  if (linked) await rm(join(root, 'node_modules'))
  await rm(root, { recursive: true })
}
