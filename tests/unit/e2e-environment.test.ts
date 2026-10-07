import { execFile } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { createOwnedStorage, fixtureEnvironment } from '../../scripts/backend-hardening/fixture'
import { loadPlaywrightEnvironment } from '../../utils/e2eEnvironment'

describe('Playwright admin credentials remain test-only process variables', () => {
  it('loads E2E_ADMIN_USERNAME/PASSWORD from owned .env with quoted hashes and comments', async () => {
    const storage = await createOwnedStorage()
    try {
      await writeFile(storage.path('.env'), "E2E_ADMIN_USERNAME='fixture_admin' # comment\r\nE2E_ADMIN_PASSWORD='fixture # password' # comment\r\n")
      const env: NodeJS.ProcessEnv = {}
      loadPlaywrightEnvironment(storage.root, env)
      expect(env.E2E_ADMIN_USERNAME).toBe('fixture_admin')
      expect(env.E2E_ADMIN_PASSWORD).toBe('fixture # password')
    } finally {await storage.cleanup()}
  })
  it('keeps process overrides and .env.e2e.local > .env.e2e > .env.local > .env precedence, including empty values', async () => {
    const storage = await createOwnedStorage()
    try {
      for (const [file, value] of [['.env', 'base'], ['.env.local', 'local'], ['.env.e2e', 'e2e'], ['.env.e2e.local', 'e2e-local']]) {
        await writeFile(storage.path(file!), `E2E_ADMIN_USERNAME=${value}\nE2E_ADMIN_PASSWORD=${value}\n`)
      }
      const env: NodeJS.ProcessEnv = {E2E_ADMIN_PASSWORD: 'process'}
      loadPlaywrightEnvironment(storage.root, env)
      expect(env).toEqual({E2E_ADMIN_USERNAME: 'e2e-local', E2E_ADMIN_PASSWORD: 'process'})
      const empty: NodeJS.ProcessEnv = {E2E_ADMIN_USERNAME: '', E2E_ADMIN_PASSWORD: ''}
      loadPlaywrightEnvironment(storage.root, empty)
      expect(empty).toEqual({E2E_ADMIN_USERNAME: '', E2E_ADMIN_PASSWORD: ''})
    } finally {await storage.cleanup()}
  })
  it('audits every available E2E spec, including git-ignored development files, for canonical login credentials', async () => {
    const files = (await readdir(resolve('tests/e2e'))).filter(file => file.endsWith('.spec.ts'))
    let authenticated = 0
    for (const file of files) {
      const source = await readFile(resolve('tests/e2e', file), 'utf8')
      expect(source, file).not.toMatch(/process\.env\.APP_LOGIN_(?:USERNAME|PASSWORD)/)
      if (source.includes('/api/auth/login') || /input\[autocomplete="current-password"\]['"]\)\.fill\(/.test(source)) {
        authenticated++
        expect(source, file).toContain('process.env.E2E_ADMIN_USERNAME')
        expect(source, file).toContain('process.env.E2E_ADMIN_PASSWORD')
        expect(source, file).not.toMatch(/const\s+(?:adminUsername|adminPassword|username|password)\s*=\s*['"][^'"]+['"]/)
      }
    }
    expect(authenticated).toBeGreaterThan(0)
  })
  it('Playwright collects all available development specs using an owned environment, without running tests', async () => {
    const storage = await createOwnedStorage()
    try {
      await writeFile(storage.path('.env'), 'E2E_ADMIN_USERNAME=fixture_admin\nE2E_ADMIN_PASSWORD=fixture-only\n')
      const {stdout} = await promisify(execFile)(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', '--list', '--config', resolve('playwright.config.ts')], {
        cwd: storage.root, env: {...fixtureEnvironment(), PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:1'}, timeout: 30_000, maxBuffer: 512 * 1024
      })
      const files = (await readdir(resolve('tests/e2e'))).filter(file => file.endsWith('.spec.ts'))
      const total = stdout.match(/Total: (\d+) tests in (\d+) files/)
      expect(total).not.toBeNull()
      expect(Number(total![1])).toBeGreaterThan(0)
      expect(Number(total![2])).toBe(files.length)
      process.stdout.write(JSON.stringify({evidence: 'owned-Playwright-collection-not-browser-login', node: process.version, tests: Number(total![1]), files: Number(total![2])}) + '\n')
    } finally {await storage.cleanup()}
  }, 35_000)
  it('actual Playwright config still loads those exact names, without launching an app or browser', async () => {
    const storage = await createOwnedStorage()
    try {
      await writeFile(storage.path('.env'), 'E2E_ADMIN_USERNAME=fixture_admin\nE2E_ADMIN_PASSWORD="fixture # password"\n')
      const config = pathToFileURL(resolve('playwright.config.ts')).href
      await writeFile(storage.path('check.mjs'), `import assert from 'node:assert/strict';
const {default: config} = await import(${JSON.stringify(config)});
assert.equal(process.env.E2E_ADMIN_USERNAME, 'fixture_admin');
assert.equal(process.env.E2E_ADMIN_PASSWORD, 'fixture # password');
assert.equal(config.webServer, undefined);`)
      await promisify(execFile)(process.execPath, ['--import', pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href, storage.path('check.mjs')], {
        cwd: storage.root, env: {...fixtureEnvironment(), PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:1'}, timeout: 20_000, maxBuffer: 4096
      })
      for (const file of ['tests/e2e/login-redirect.spec.ts', 'tests/e2e/advanced-search.spec.ts']) {
        const source = await readFile(resolve(file), 'utf8')
        expect(source).toContain('process.env.E2E_ADMIN_USERNAME')
        expect(source).toContain('process.env.E2E_ADMIN_PASSWORD')
        expect(source).not.toContain('APP_LOGIN_USERNAME')
      }
    } finally {await storage.cleanup()}
  })
})
