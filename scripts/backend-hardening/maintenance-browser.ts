import type { chromium } from '@playwright/test'

export interface BrowserFixtureInput {
  base: string
  password: string
  profile: string
  labels: Record<string, {dashboard: string, hold: string, createBackup: string, importBackup: string, settings: string, noBackups: string, loadFailed: string}>
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
          const labels = input.labels[locale]!
          const ssr = await page.request.get(input.base + '/admin/backups'), html = await ssr.text()
          if (!ssr.ok() || !html.includes(labels.noBackups) || html.includes(labels.loadFailed)) throw new Error('Owned authenticated SSR backup list did not render')
          const rejected = await page.request.post(input.base + '/api/admin/backups', {headers: {Origin: input.base}, data: {type: 'partial'}})
          if (rejected.status() !== 400) throw new Error('Retired create mode did not reject before job admission')
          const crossOrigin = await page.request.post(input.base + '/api/admin/backups/import', {headers: {Origin: 'https://invalid.example'}, data: 'not-ingested'})
          if (crossOrigin.status() !== 403) throw new Error('Backup import bypassed origin policy')
          if ((await page.request.head(input.base + '/api/admin/backups/owned-missing/download')).status() !== 409) throw new Error('Unified HEAD route did not retain authenticated admission')
          const anonymous = await browser.newContext()
          try {
            if ((await anonymous.request.get(input.base + '/api/admin/backups/owned-missing/download')).status() !== 401) throw new Error('Anonymous bundle route leaked snapshot visibility')
          } finally {await anonymous.close()}
          await page.getByRole('button', {name: labels.createBackup, exact: true}).click()
          await page.locator('#backup-note').waitFor({state: 'visible'})
          if (await page.locator('input[type=radio]').count() || await page.locator('[role=combobox]').count()) throw new Error('Retired backup mode/table/parent controls remain')
          await page.keyboard.press('Escape')
          await page.locator('#backup-note').waitFor({state: 'hidden'})
          await page.getByRole('button', {name: labels.importBackup, exact: true}).click()
          await page.locator('#backup-file').waitFor({state: 'visible'})
          if (await page.locator('input[type=file]').count() !== 1) throw new Error('Bundle import must expose one file input')
          await page.keyboard.press('Escape')
          await page.locator('#backup-file').waitFor({state: 'hidden'})
          await page.getByRole('button', {name: labels.settings, exact: true}).click()
          await page.locator('input[type=number]').waitFor({state: 'visible'})
          if (await page.locator('[role=switch]').count()) throw new Error('Mandatory restore protection has a skip switch')
          await page.keyboard.press('Escape')
          await page.setViewportSize({width: 360, height: 780})
          if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)) throw new Error('Backup page overflows mobile width')
          await page.setViewportSize({width: 1280, height: 800})
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
