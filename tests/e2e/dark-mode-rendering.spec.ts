import { expect, test } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'
const username = process.env.E2E_ADMIN_USERNAME
const password = process.env.E2E_ADMIN_PASSWORD

test('stored public dark mode is applied before app hydration', async ({ browser }) => {
  const context = await browser.newContext({ baseURL })
  await context.addInitScript(() => {
    localStorage.setItem('pb-public-color-mode', 'dark')
  })
  const page = await context.newPage()

  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark')

  await context.close()
})

test('editor and public block chrome use dark theme tokens', async ({ browser }) => {
  test.skip(!username || !password, 'Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD to run authenticated tests.')

  const apiContext = await browser.newContext({ baseURL })
  const loginResp = await apiContext.request.post('/api/auth/login', {
    data: { username, password }
  })
  expect(loginResp.status(), `login failed: ${await loginResp.text()}`).toBe(200)
  const storage = await apiContext.storageState()
  await apiContext.close()

  const context = await browser.newContext({ baseURL, storageState: storage })
  await context.addInitScript(() => {
    localStorage.setItem('pb-public-color-mode', 'dark')
  })
  const page = await context.newPage()

  const title = `Dark Mode Blocks ${Date.now()}`
  const slug = `dark-mode-blocks-${Date.now()}`
  const contentJson = buildContent()
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
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await expectTokenColor(page, '.pandablog-block-editor .ProseMirror th', 'backgroundColor', '--pb-table-header-bg')
  await expectTokenColor(page, '.pandablog-block-editor .tabs-block-tab.is-active', 'color', '--pb-primary')
  await expectTokenColor(page, '.pandablog-block-editor .tabs-block-panel', 'backgroundColor', '--pb-surface')
  await expectTokenColor(page, '.pandablog-block-editor .quote-block', 'color', '--pb-text')
  await expectTokenColor(page, '.pandablog-block-editor .mediatext-nodeview', 'backgroundColor', '--pb-surface')
  await expectTokenColor(page, '.pandablog-block-editor .mediatext-media', 'backgroundColor', '--pb-surface-subtle')
  await expectTokenColor(page, '.pandablog-block-editor .mermaid-preview-pane', 'backgroundColor', '--pb-card-bg')
  await expectTokenColor(page, '.pandablog-block-editor .customhtml-nodeview.is-preview-mode', 'backgroundColor', '--pb-surface')

  await page.locator('[data-testid="block-add-button"]').first().click()
  await expect(page.locator('[data-testid="block-inserter-item-tabsBlock"]')).toBeVisible()
  await expectTokenColor(page, '[data-testid="block-inserter-item-tabsBlock"]', 'backgroundColor', '--pb-card-bg')
  await expectTokenColor(page, '[data-testid="block-inserter-item-tabsBlock"]', 'color', '--pb-text-muted')

  await page.goto(`/blog/${slug}`)
  await page.waitForLoadState('networkidle')
  await page.locator('.blog-content').waitFor()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await expectTokenColor(page, '.blog-content .columns-block-header', 'backgroundColor', '--pb-surface-subtle')
  await expectTokenColor(page, '.blog-content .tabs-block-panel', 'backgroundColor', '--pb-surface')
  await expectTokenColor(page, '.blog-content .quote-block', 'color', '--pb-text')
  await expectTokenColor(page, '.blog-content th', 'backgroundColor', '--pb-table-header-bg')
  await expectTokenColor(page, '.blog-content .mediatext-media', 'backgroundColor', '--pb-surface-subtle')
  await expectTokenColor(page, '.blog-content .mermaid-preview-pane', 'backgroundColor', '--pb-card-bg')
  await expectTokenColor(page, '.blog-content .customhtml-block', 'backgroundColor', '--pb-surface')

  await context.close()
})

async function expectTokenColor(page: import('@playwright/test').Page, selector: string, property: keyof CSSStyleDeclaration, token: string) {
  const result = await page.locator(selector).first().evaluate((element, { property, token }) => {
    const style = getComputedStyle(element)
    const probe = document.createElement('span')
    probe.style[property as unknown as number] = `var(${token})`
    document.body.append(probe)
    const expected = getComputedStyle(probe)[property as keyof CSSStyleDeclaration]
    probe.remove()
    return {
      actual: style[property as keyof CSSStyleDeclaration],
      expected
    }
  }, { property, token })

  expect(result.actual, `${selector} ${String(property)} should match ${token}`).toBe(result.expected)
}

function buildContent() {
  return {
    type: 'doc',
    content: [
      {
        type: 'blockquote',
        attrs: { style: 'bar', authorName: 'Author Name', authorTitle: 'Role' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quote body' }] }]
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
      {
        type: 'mediaText',
        attrs: {
          mediaSrc: '',
          mediaAlt: '',
          mediaTitle: 'Media caption',
          mediaTitlePosition: 'bottom',
          mediaSourceSize: 'full',
          mediaDisplaySize: 'fill-container',
          mediaDisplayPercent: 100,
          mediaDisplayPx: null,
          blockWidth: 'content',
          mediaWidth: null,
          mediaHeight: null,
          mediaWidthPercent: 100,
          mediaNaturalWidth: null,
          mediaNaturalHeight: null,
          lockAspect: true,
          mediaPosition: 'left',
          ratio: 0.5
        },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Media and text body' }] }]
      },
      { type: 'mermaid', attrs: { code: 'graph TD;\n  A[Idea] --> B[Connection]' } },
      { type: 'customHtml', attrs: { html: '<div>Custom HTML widget preview</div>' } },
      buildTable()
    ]
  }
}

function buildTable() {
  return {
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: [
          { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header 1' }] }] },
          { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header 2' }] }] },
          { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header 3' }] }] }
        ]
      },
      {
        type: 'tableRow',
        content: [
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 1' }] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 2' }] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 3' }] }] }
        ]
      }
    ]
  }
}
