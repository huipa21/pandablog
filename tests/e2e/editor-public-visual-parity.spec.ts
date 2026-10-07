import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { dialogueFixture } from './fixtures/dialogue'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'
const username = process.env.E2E_ADMIN_USERNAME
const password = process.env.E2E_ADMIN_PASSWORD

const imageSvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#dff3ed"/>
  <circle cx="185" cy="170" r="72" fill="#0f766e" opacity="0.9"/>
  <rect x="300" y="105" width="220" height="150" rx="18" fill="#134e4a" opacity="0.82"/>
  <text x="320" y="190" font-family="Arial" font-size="34" font-weight="700" fill="#ffffff">PandaBlog</text>
</svg>`)
const imageSrc = `data:image/svg+xml;charset=utf-8,${imageSvg}`

type Box = { x: number; y: number; width: number; height: number }

type SurfaceMetrics = {
  content: Box
  code: Box
  table: Box
  codeRatio: number
  tableRatio: number
  link: Record<string, string>
  inlineCode: Record<string, string>
  highlight: Record<string, string>
  tableHeader: Record<string, string>
}

const styleProps = [
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderTopStyle',
  'borderTopWidth',
  'borderRadius',
  'fontSize',
  'fontFamily',
  'paddingLeft',
  'paddingRight',
  'textDecorationLine',
  'textUnderlineOffset',
  'textAlign',
  'verticalAlign'
]

const BLOCKS = [
  { name: 'paragraph', editor: '.ProseMirror p:has-text("Paragraph block")', public: '.blog-content p:has-text("Paragraph block")' },
  { name: 'heading', editor: '.ProseMirror h2:has-text("Heading two")', public: '.blog-content h2:has-text("Heading two")' },
  { name: 'bullet list', editor: '.ProseMirror ul li:has-text("Bullet item")', public: '.blog-content ul li:has-text("Bullet item")' },
  { name: 'ordered list', editor: '.ProseMirror ol li:has-text("Ordered item")', public: '.blog-content ol li:has-text("Ordered item")' },
  { name: 'quote', editor: '.quote-block .quote-bar-row', public: '.blog-content .quote-block .quote-bar-row' },
  { name: 'image', editor: '.imageblock-nodeview', public: '.blog-content .imageblock-nodeview' },
  { name: 'media and text', editor: '.mediatext-nodeview', public: '.blog-content .mediatext-nodeview' },
  { name: 'columns', editor: '.columns-block .columns-block-column:has-text("Column one body")', public: '.blog-content .columns-block .columns-block-column:has-text("Column one body")' },
  { name: 'tabs', editor: '.tabs-block .tabs-block-panel:has-text("First tab panel body")', public: '.blog-content .tabs-block .tabs-block-panel:has-text("First tab panel body")' },
  { name: 'dialogue', editor: '.dialogue-block', public: '.blog-content .dialogue-block' },
  { name: 'table', editor: '.ProseMirror table', public: '.blog-content table' },
  { name: 'code block', editor: '.codeblock-nodeview', public: '.blog-content .codeblock-nodeview' },
  { name: 'mermaid', editor: '.mermaid-nodeview .mermaid-preview', public: '.blog-content .mermaid-nodeview .mermaid-preview' },
  { name: 'separator', editor: '.ProseMirror hr', public: '.blog-content hr' },
  { name: 'custom html', editor: '.customhtml-nodeview.is-preview-mode iframe.customhtml-iframe', public: '.blog-content .customhtml-block iframe.customhtml-iframe' },
  { name: 'footnotes', editor: '.footnotes-block', public: '.blog-content .footnotes-block' }
]

test('editor and public post render all blocks with matching visual dimensions and inline styles', async ({ browser }, testInfo) => {
  test.skip(!username || !password, 'Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD to run authenticated tests.')

  const visualArtifactDir = join(process.cwd(), 'test-results', 'wysiwyg-visual-parity')
  rmSync(visualArtifactDir, { recursive: true, force: true })
  mkdirSync(visualArtifactDir, { recursive: true })

  const apiContext = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-pandablog-client': 'non-browser' } })
  const loginResp = await apiContext.request.post('/api/auth/login', {
    data: { username, password }
  })
  expect(loginResp.status(), `login failed: ${await loginResp.text()}`).toBe(200)
  const storage = await apiContext.storageState()
  await apiContext.close()

  const context = await browser.newContext({ baseURL, storageState: storage, viewport: { width: 1365, height: 900 }, extraHTTPHeaders: { 'x-pandablog-client': 'non-browser' } })
  const page = await context.newPage()

  const title = `Visual WYSIWYG All Blocks ${Date.now()}`
  const slug = `visual-wysiwyg-all-blocks-${Date.now()}`
  const footnoteId = `note-${Date.now()}`

  const contentJson = buildContent(slug, footnoteId)
  const createResp = await context.request.post('/api/admin/posts', {
    data: { title, slug, status: 'published', content_json: contentJson }
  })
  expect(createResp.status(), `create failed: ${await createResp.text()}`).toBe(200)
  const created = await createResp.json()
  const postId = String(created.id ?? '')
  expect(postId).toBeTruthy()

  await page.goto(`/admin/posts/${encodeURIComponent(postId)}`)
  await page.waitForLoadState('networkidle')
  await page.locator('.pandablog-block-editor .ProseMirror').waitFor()
  await page.locator('.mermaid-nodeview .mermaid-preview svg').first().waitFor({ state: 'visible', timeout: 15000 })

  for (const block of BLOCKS) {
    await expect(page.locator(block.editor).first(), `editor block missing: ${block.name}`).toBeVisible()
  }

  const editorMetrics = await collectMetrics(page, 'editor')
  await page.locator('.pb-content-frame').screenshot({ path: testInfo.outputPath('editor-frame.png') })
  await page.locator('.pb-content-frame').screenshot({ path: join(visualArtifactDir, 'editor-frame.png') })
  await captureBlockScreenshots(page, testInfo, visualArtifactDir, 'editor')

  await page.goto(`/blog/${slug}`)
  await page.waitForLoadState('networkidle')
  await page.locator('.blog-content').waitFor()
  await page.locator('.mermaid-nodeview .mermaid-preview svg').first().waitFor({ state: 'visible', timeout: 15000 })

  for (const block of BLOCKS) {
    await expect(page.locator(block.public).first(), `public block missing: ${block.name}`).toBeVisible()
  }

  const publicMetrics = await collectMetrics(page, 'public')
  await page.locator('article.theme-scope').screenshot({ path: testInfo.outputPath('public-article.png') })
  await page.locator('article.theme-scope').screenshot({ path: join(visualArtifactDir, 'public-article.png') })
  await captureBlockScreenshots(page, testInfo, visualArtifactDir, 'public')

  // The code/table blocks must occupy the same proportion of the editable/readable content column.
  expect(publicMetrics.content.width, 'public content column should not be constrained to the legacy 720px theme width').toBeGreaterThan(900)
  expectClose(editorMetrics.codeRatio, publicMetrics.codeRatio, 0.06, 'code block width/content ratio')
  expectClose(editorMetrics.tableRatio, publicMetrics.tableRatio, 0.06, 'table width/content ratio')
  expect(publicMetrics.codeRatio, 'public code block should fill the public content column').toBeGreaterThan(0.94)
  expect(publicMetrics.tableRatio, 'public table should fill the public content column').toBeGreaterThan(0.94)

  // Inline marks inside tables must visually match editor output.
  expect(publicMetrics.link.color).toBe(editorMetrics.link.color)
  expect(publicMetrics.link.textDecorationLine).toBe(editorMetrics.link.textDecorationLine)
  expect(publicMetrics.link.textUnderlineOffset).toBe(editorMetrics.link.textUnderlineOffset)

  expect(publicMetrics.inlineCode.color).toBe(editorMetrics.inlineCode.color)
  expect(publicMetrics.inlineCode.backgroundColor).toBe(editorMetrics.inlineCode.backgroundColor)
  expect(publicMetrics.inlineCode.borderTopColor).toBe(editorMetrics.inlineCode.borderTopColor)
  expect(publicMetrics.inlineCode.borderRadius).toBe(editorMetrics.inlineCode.borderRadius)
  expect(publicMetrics.inlineCode.paddingLeft).toBe(editorMetrics.inlineCode.paddingLeft)

  expect(publicMetrics.highlight.backgroundColor).toBe(editorMetrics.highlight.backgroundColor)
  expect(publicMetrics.tableHeader.textAlign).toBe(editorMetrics.tableHeader.textAlign)
  expect(publicMetrics.tableHeader.backgroundColor).toBe(editorMetrics.tableHeader.backgroundColor)
  expect(publicMetrics.tableHeader.paddingLeft).toBe(editorMetrics.tableHeader.paddingLeft)

  await context.close()
})

function buildContent(slug: string, footnoteId: string) {
  return {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Paragraph block with a footnote' }, { type: 'text', text: '1', marks: [{ type: 'footnote', attrs: { id: footnoteId, index: 1 } }] }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading two' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bullet item' }] }] }] },
      { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ordered item' }] }] }] },
      {
        type: 'blockquote',
        attrs: { style: 'bar', theme: '#0f766e', fontFamily: 'sans', fontSize: '1rem', fontColor: '#1c1917', backgroundColor: '', authorName: 'Author Name', authorTitle: 'Role' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quote body' }] }]
      },
      {
        type: 'image',
        attrs: { src: imageSrc, alt: 'Generated image', title: 'Image caption', titlePosition: 'bottom', sourceSize: 'full', displaySize: 'fill-container', displayPercent: 100, displayPx: null, width: null, height: null, widthPercent: 100, naturalWidth: 640, naturalHeight: 360, lockAspect: true, align: 'center' }
      },
      {
        type: 'mediaText',
        attrs: { mediaSrc: imageSrc, mediaAlt: 'Generated media', mediaTitle: 'Media caption', mediaTitlePosition: 'bottom', mediaSourceSize: 'full', mediaDisplaySize: 'fill-container', mediaDisplayPercent: 100, mediaDisplayPx: null, blockWidth: 'content', mediaWidth: null, mediaHeight: null, mediaWidthPercent: 100, mediaNaturalWidth: 640, mediaNaturalHeight: 360, lockAspect: true, mediaPosition: 'left', ratio: 0.42, mediaMime: 'image/svg+xml', mediaName: 'generated.svg', mediaSize: 1024 },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Media and text body' }] }]
      },
      {
        type: 'columnsBlock',
        attrs: { columns: 3, proportions: '1-2-1', blockWidth: 'content' },
        content: [
          { type: 'columnItem', attrs: { header: 'Column A' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Column one body' }] }] },
          { type: 'columnItem', attrs: { header: 'Column B' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Column two body' }] }] },
          { type: 'columnItem', attrs: { header: 'Column C' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Column three body' }] }] }
        ]
      },
      {
        type: 'tabsBlock',
        attrs: { orientation: 'horizontal', tabStyle: 'pills', blockWidth: 'content', activeIndex: 0 },
        content: [
          { type: 'tabPanel', attrs: { title: 'Overview' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First tab panel body' }] }] },
          { type: 'tabPanel', attrs: { title: 'Details' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second tab panel body' }] }] }
        ]
      },
      dialogueFixture('accent'),
      buildTable(),
      {
        type: 'codeBlock',
        attrs: { language: 'javascript', theme: 'vs-dark', lineNumbers: true, wrap: true, zoom: 1, collapsed: true, fileName: 'app.vue', showTotalLines: true },
        content: [{ type: 'text', text: '/**\n * Hash a password with argon2id for use in .env (APP_LOGIN_PASSWORD_HASH).\n */\nimport argon2 from \'argon2\'\n\nasync function main() {\n  const password = process.argv[2]\n  console.log(password)\n}' }]
      },
      { type: 'mermaid', attrs: { code: 'graph TD;\n  A[Idea] --> B[Connection]' } },
      { type: 'horizontalRule', attrs: { styleType: 'solid', thickness: 1, marginY: 16, color: '#d6d3d1' } },
      { type: 'customHtml', attrs: { html: '<div style="padding:8px;background:#eef;color:#003;">Custom HTML widget preview</div>' } },
      { type: 'footnotesBlock', content: [{ type: 'orderedList', content: [{ type: 'listItem', attrs: { footnoteId }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Footnote body' }] }] }] }] }
    ]
  }
}

function buildTable() {
  return {
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: ['a1', 'a2', 'a3'].map((text) => ({ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }))
      },
      {
        type: 'tableRow',
        content: [
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abc', marks: [{ type: 'bold' }] }, { type: 'text', text: 't', marks: [{ type: 'subscript' }] }] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'efg', marks: [{ type: 'italic' }] }, { type: 'text', text: '2', marks: [{ type: 'superscript' }] }] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'qij' }] }] }
        ]
      },
      {
        type: 'tableRow',
        content: [
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Google', marks: [{ type: 'link', attrs: { href: 'https://www.google.com/', openMode: 'same-tab' } }] }] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hh', marks: [{ type: 'code' }] }] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'kk', marks: [{ type: 'highlight', attrs: { color: '#ffff00' } }] }] }] }
        ]
      }
    ]
  }
}

async function collectMetrics(page: Page, surface: 'editor' | 'public'): Promise<SurfaceMetrics> {
  const isEditor = surface === 'editor'
  const content = isEditor
    ? page.locator('.pandablog-block-editor .ProseMirror').first()
    : page.locator('.blog-content').first()
  const code = isEditor
    ? page.locator('.codeblock-nodeview').first()
    : page.locator('.blog-content .codeblock-nodeview').first()
  const table = isEditor
    ? page.locator('.pandablog-block-editor .ProseMirror table').first()
    : page.locator('.blog-content table').first()
  const link = isEditor
    ? page.locator('.pandablog-block-editor .ProseMirror table a[href="https://www.google.com/"]').first()
    : page.locator('.blog-content table a[href="https://www.google.com/"]').first()
  const inlineCode = isEditor
    ? page.locator('.pandablog-block-editor .ProseMirror table code', { hasText: 'hh' }).first()
    : page.locator('.blog-content table code', { hasText: 'hh' }).first()
  const highlight = isEditor
    ? page.locator('.pandablog-block-editor .ProseMirror table mark, .pandablog-block-editor .ProseMirror table span[style*="background"]', { hasText: 'kk' }).first()
    : page.locator('.blog-content table mark, .blog-content table span[style*="background"]', { hasText: 'kk' }).first()
  const tableHeader = isEditor
    ? page.locator('.pandablog-block-editor .ProseMirror table th', { hasText: 'a1' }).first()
    : page.locator('.blog-content table th', { hasText: 'a1' }).first()

  const [contentBox, codeBox, tableBox] = await Promise.all([box(content), box(code), box(table)])

  return {
    content: contentBox,
    code: codeBox,
    table: tableBox,
    codeRatio: codeBox.width / contentBox.width,
    tableRatio: tableBox.width / contentBox.width,
    link: await styles(link),
    inlineCode: await styles(inlineCode),
    highlight: await styles(highlight),
    tableHeader: await styles(tableHeader)
  }
}

async function box(locator: Locator): Promise<Box> {
  const value = await locator.boundingBox()
  expect(value, `missing bounding box for ${locator}`).not.toBeNull()
  return value!
}

async function styles(locator: Locator) {
  await expect(locator).toBeVisible()
  return locator.evaluate((node, props) => {
    const computed = window.getComputedStyle(node as Element)
    return Object.fromEntries((props as string[]).map((name) => [name, computed.getPropertyValue(name)]))
  }, styleProps)
}

function expectClose(actual: number, expected: number, tolerance: number, label: string) {
  expect(Math.abs(actual - expected), `${label}: expected ${actual} to be within ${tolerance} of ${expected}`).toBeLessThanOrEqual(tolerance)
}

async function captureBlockScreenshots(page: Page, testInfo: TestInfo, visualArtifactDir: string, surface: 'editor' | 'public') {
  for (const block of BLOCKS) {
    const selector = surface === 'editor' ? block.editor : block.public
    const locator = page.locator(selector).first()
    await locator.scrollIntoViewIfNeeded()
    const fileName = `${surface}-${safeName(block.name)}.png`
    await locator.screenshot({ path: testInfo.outputPath(fileName) })
    await locator.screenshot({ path: join(visualArtifactDir, fileName) })
  }
}

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}
