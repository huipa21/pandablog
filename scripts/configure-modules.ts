import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PANDABLOG_MODULES, EDITOR_BLOCK_KEYS, PANDABLOG_MODULES_MANIFEST, normalizePandablogModules } from '../build/pandablog-modules'
import type { EditorBlockKey, PandablogModulesManifest } from '../types/pandablog-modules'

const rootDir = process.cwd()
const scriptDir = dirname(fileURLToPath(import.meta.url))
const manifestPath = resolve(rootDir, PANDABLOG_MODULES_MANIFEST)
const configurePagePath = resolve(scriptDir, 'configure/index.html')
const requestedPort = Number(process.env.PB_CONFIGURE_PORT ?? 3030)
const checkOnly = process.argv.includes('--check')
const noOpen = process.argv.includes('--no-open') || checkOnly

if (checkOnly) {
  const manifest = readManifest()
  const html = renderConfiguratorHtml()
  if (!html.includes('data-path="logs.enabled"') || !html.includes('data-path="graphView.enabled"') || !html.includes('data-path="themes.enabled"') || !html.includes('data-path="postVersioning.enabled"') || !html.includes('data-path="editor.blocks.mermaid"')) {
    throw new Error('Configurator page is missing expected module controls')
  }
  console.log(`Pandablog modules manifest OK (${Object.keys(manifest.modules.editor.blocks).length} editor blocks).`)
  process.exit(0)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

    if (req.method === 'GET' && url.pathname === '/') {
      return sendHtml(res, renderConfiguratorHtml())
    }

    if (req.method === 'GET' && url.pathname === '/api/modules') {
      return sendJson(res, readManifest())
    }

    if (req.method === 'PUT' && url.pathname === '/api/modules') {
      const manifest = normalizePandablogModules(JSON.parse(await readBody(req)) as Partial<PandablogModulesManifest>)
      writeFileSync(manifestPath, `${JSON.stringify({ $schema: './types/pandablog-modules.schema.json', ...manifest }, null, 2)}\n`)
      return sendJson(res, readManifest())
    }

    sendText(res, 'Not found', 404)
  } catch (error) {
    sendJson(res, { error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

listen(requestedPort)

function listen(port: number) {
  server.once('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE' && port < requestedPort + 20) {
      listen(port + 1)
      return
    }

    throw error
  })

  server.listen(port, () => {
    const url = `http://localhost:${port}`
    console.log(`Pandablog module configurator running at ${url}`)
    console.log('Press Ctrl+C to stop.')
    if (!noOpen) openBrowser(url)
  })
}

function readManifest(): PandablogModulesManifest {
  if (!existsSync(manifestPath)) {
    return {
      $schema: './types/pandablog-modules.schema.json',
      version: 1,
      modules: DEFAULT_PANDABLOG_MODULES
    }
  }

  return normalizePandablogModules(JSON.parse(readFileSync(manifestPath, 'utf8')) as Partial<PandablogModulesManifest>)
}

function renderConfiguratorHtml(): string {
  const blockLabels: Record<EditorBlockKey, string> = {
    accordionBlock: 'Accordion',
    annotationBlock: 'Annotation + dictionaries',
    blockMath: 'Block math (KaTeX)',
    blockquote: 'Quote',
    codeBlock: 'Code block + syntax highlighting',
    columnsBlock: 'Columns',
    customHtml: 'Custom HTML',
    diffBlock: 'Diff',
    filesBlock: 'Files',
    footnotesBlock: 'Footnotes',
    horizontalRule: 'Separator',
    image: 'Image',
    inlineMath: 'Inline math (KaTeX)',
    mediaText: 'Media + text',
    mermaid: 'Mermaid diagrams',
    relatedPost: 'Related post',
    table: 'Table',
    tabsBlock: 'Tabs',
    videoEmbed: 'Video embeds'
  }

  const blockInputs = EDITOR_BLOCK_KEYS.map((key) => renderCheckbox(`editor.blocks.${key}`, blockLabels[key])).join('')
  return readFileSync(configurePagePath, 'utf8')
    .replace('%PB_EDITOR_MODULE_INPUT%', renderCheckbox('editor.enabled', 'Editor module'))
    .replace('%PB_EDITOR_BLOCK_INPUTS%', blockInputs)
    .replace('%PB_MANIFEST_NAME%', PANDABLOG_MODULES_MANIFEST)
}

function renderCheckbox(path: string, label: string): string {
  return `<label><input type="checkbox" data-path="${escapeHtml(path)}"><span>${escapeHtml(label)}</span></label>`
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendHtml(res: ServerResponse, body: string) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(body)
}

function sendJson(res: ServerResponse, body: unknown, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function sendText(res: ServerResponse, body: string, status = 200) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(body)
}

function openBrowser(url: string) {
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref()
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char)
}