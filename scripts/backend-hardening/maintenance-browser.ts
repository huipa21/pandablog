import type { chromium } from '@playwright/test'

export interface BrowserFixtureInput {
  base: string
  password: string
  profile: string
  labels: Record<string, {dashboard: string, hold: string}>
}
/** Self-contained so an explicit Windows Node/browser can exercise an owned
 * WSL loopback app without installing global Linux shared libraries. */
export async function browserSmoke(driver: typeof chromium, input: BrowserFixtureInput) {
  const browser = await driver.launch({headless: true})
  try {
    for (const locale of ['en', 'zh-CN']) {
      const context = await browser.newContext({locale}), page = await context.newPage()
      try {
        await context.addCookies([{name: 'pb-public-locale', value: locale, url: input.base}])
        await page.goto(`${input.base}/login`, {waitUntil: 'networkidle', timeout: 45_000})
        await page.locator('input[type=text]').fill('admin')
        await page.locator('input[type=password]').fill(input.password)
        await Promise.all([page.waitForURL(/\/admin/, {timeout: 30_000}), page.locator('button[type=submit]').click()])
        const settings = await page.request.post(`${input.base}/api/admin/settings`, {headers: {Origin: input.base}, data: {admin_locale: locale}})
        if (!settings.ok() || (await settings.json()).settings?.admin_locale !== locale) throw new Error('Owned admin locale update failed')
        await page.goto(`${input.base}/admin`, {waitUntil: 'networkidle', timeout: 45_000})
        if (!await page.getByRole('link', {name: input.labels[locale]!.dashboard, exact: true}).first().isVisible()) throw new Error('Owned localized admin navigation failed')
        if (input.profile !== 'minimal' && input.profile !== 'no-backups') {
          await page.goto(`${input.base}/admin/backups`, {waitUntil: 'networkidle', timeout: 45_000})
          if ((await page.request.get(`${input.base}/api/admin/backups/status`)).status() !== 200) throw new Error('Owned authenticated backup status failed')
          const status = await page.request.get(input.base + '/api/admin/backups/status')
          const body = await status.json() as {jobs_blocked_until?: number | null, recovery_required?: boolean}
          if (!status.ok() || typeof body.jobs_blocked_until !== 'number' || body.jobs_blocked_until <= Date.now() || body.recovery_required) throw new Error('Owned finite job-only hold status was not reported')
          await page.goto(input.base + '/admin/backups', {waitUntil: 'networkidle', timeout: 45_000})
        }
        await page.goto(input.base, {waitUntil: 'networkidle', timeout: 45_000})
      } finally {await context.close()}
    }
  } catch (error) {
    // Playwright call logs can include fill values. Never relay the generated
    // password through diagnostic output, even on a fixture failure.
    throw new Error(String((error as Error)?.message ?? 'Browser fixture failed').replaceAll(input.password, '[fixture-redacted]'))
  } finally {await browser.close()}
}
