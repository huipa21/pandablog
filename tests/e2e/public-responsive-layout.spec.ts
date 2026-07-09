import { expect, test, type Page } from '@playwright/test'

const VIEWPORTS = [
  { width: 360, height: 900 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 }
] as const

test.describe('public responsive layout', () => {
  for (const viewport of VIEWPORTS) {
    test(`home shell stays aligned at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/)
      await expect(page.locator('[data-public-container="body"]')).toBeVisible()
      await expect(page.locator('[data-public-container="footer"]')).toBeVisible()
      await expectNoViewportOverflow(page, `${viewport.width}px public home`)
      await expectContainerEdgesToMatch(page, viewport.width)

      if (viewport.width < 640) {
        await expectPostCardsToStack(page)
      }
    })
  }

  test('mobile home has real list mode without redundant hero menu', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('[data-public-container="hero-nav"] button[aria-label*="navigation" i]')).toHaveCount(0)

    const listToggle = page.getByTestId('post-view-toggle')
    if (await listToggle.count() === 0) {
      return
    }

    await listToggle.click()
    const list = page.locator('[data-post-card-layout="list"]')
    await expect(list).toBeVisible()
    await expectNoViewportOverflow(page, '360px public list mode')

    const firstCard = list.locator('article').first()
    if (await firstCard.count() === 0) {
      return
    }

    const columns = await firstCard.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
    expect(columns, 'mobile list view should render media and content as separate columns').toBeGreaterThan(1)
  })

  test('home grid keeps readable card widths on wider screens', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pb-post-view-mode', 'grid'))

    for (const viewport of [
      { width: 1024, height: 900 },
      { width: 1440, height: 1000 }
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      const cards = page.locator('[data-post-card-layout="grid"] > article')
      if (await cards.count() === 0) {
        continue
      }

      const first = await cards.first().boundingBox()
      expect(first, `first grid post card must be measurable at ${viewport.width}px`).toBeTruthy()
      if (!first) continue

      expect(first.width, `grid cards should stay readable at ${viewport.width}px`).toBeGreaterThanOrEqual(300)
      await expectNoViewportOverflow(page, `${viewport.width}px public grid cards`)
    }
  })

  test('list cover images do not stretch post rows', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pb-post-view-mode', 'list'))
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const imageCard = page.locator('[data-post-card-layout="list"] > article:has(img)').first()
    if (await imageCard.count() === 0) {
      return
    }

    const imagePosition = await imageCard.locator('img').first().evaluate((element) => getComputedStyle(element).position)
    expect(imagePosition, 'list cover image must be out of flow so it cannot set the row height').toBe('absolute')
    await expectNoViewportOverflow(page, '1024px public list cards')
  })
})

async function expectContainerEdgesToMatch(page: Page, viewportWidth: number) {
  const metrics = await page.evaluate(() => {
    const selectors = [
      '[data-public-container="hero-nav"]',
      '[data-public-container="compact-nav"]',
      '[data-public-container="body"]',
      '[data-public-container="footer"]'
    ]

    return selectors.flatMap((selector) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) return []

      const rect = element.getBoundingClientRect()
      return [{
        selector,
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width)
      }]
    })
  })

  const body = metrics.find((item) => item.selector === '[data-public-container="body"]')
  expect(body, 'public body container must be measurable').toBeTruthy()
  if (!body) return

  for (const metric of metrics) {
    expect(metric.left, `${metric.selector} left edge should match body at ${viewportWidth}px`).toBeCloseTo(body.left, 0)
    expect(metric.right, `${metric.selector} right edge should match body at ${viewportWidth}px`).toBeCloseTo(body.right, 0)
  }
}

async function expectPostCardsToStack(page: Page) {
  const cards = page.locator('[data-post-card-layout="grid"] > article')
  const count = await cards.count()
  if (count < 2) return

  const first = await cards.nth(0).boundingBox()
  const second = await cards.nth(1).boundingBox()
  expect(first, 'first post card must be measurable').toBeTruthy()
  expect(second, 'second post card must be measurable').toBeTruthy()
  if (!first || !second) return

  expect(second.y, 'post cards should stack vertically on mobile').toBeGreaterThan(first.y + first.height - 1)
  expect(second.x, 'stacked post cards should share the same left edge').toBeCloseTo(first.x, 0)
  expect(second.width, 'stacked post cards should share the same width').toBeCloseTo(first.width, 0)
}

async function expectNoViewportOverflow(page: Page, label: string) {
  const metrics = await page.evaluate(() => {
    const scrollingElement = document.scrollingElement ?? document.documentElement
    const innerWidth = window.innerWidth
    const offenders = Array.from(document.body.querySelectorAll<HTMLElement>('*'))
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          selector: describeElement(element),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width)
        }
      })
      .filter((item) => item.right > innerWidth + 1 || item.left < -1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 5)

    return {
      innerWidth,
      scrollWidth: scrollingElement.scrollWidth,
      offenders
    }

    function describeElement(element: HTMLElement) {
      const classes = Array.from(element.classList).slice(0, 3).map((className) => `.${className}`).join('')
      const dataContainer = element.dataset.publicContainer ? `[data-public-container="${element.dataset.publicContainer}"]` : ''
      const dataLayout = element.dataset.postCardLayout ? `[data-post-card-layout="${element.dataset.postCardLayout}"]` : ''
      return `${element.tagName.toLowerCase()}${classes}${dataContainer}${dataLayout}`
    }
  })

  expect(
    metrics.scrollWidth,
    `${label} must not overflow horizontally. Offenders: ${JSON.stringify(metrics.offenders)}`
  ).toBeLessThanOrEqual(metrics.innerWidth + 1)
}