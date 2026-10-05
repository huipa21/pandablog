import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import { ModuleKind, transpileModule } from 'typescript'
import * as vue from 'vue'
import * as renderer from 'vue/server-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accessHourlyChartPoints } from '../../utils/loggingChart'
import type { AccessHourlyBucket } from '../../types/logging'

// Compile the real SFC for SSR; only Nuxt data fetching and UI primitives are stubbed.
const source = readFileSync(new URL('../../pages/admin/dashboard/logs/index.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'log-dashboard-test', inlineTemplate: true, templateOptions: { ssr: true } })
const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
const exports: Record<string, any> = {}
new Function('require', 'exports', code)((id: string) => {
  if (id === 'vue') return vue
  if (id === 'vue/server-renderer') return renderer
  if (id === '~/utils/loggingChart') return { accessHourlyChartPoints }
  throw new Error(`Unexpected dashboard import: ${id}`)
}, exports)
const Dashboard = exports.default
const buckets = (): AccessHourlyBucket[] => Array.from({ length: 24 }, (_, index) => ({
  hour: new Date(Date.UTC(2026, 4, 20, 1 + index)).toISOString(), count: index === 22 ? 450 : 0, errors: index === 22 ? 15 : 0
}))
let hourly: AccessHourlyBucket[]
let accessEnabled: boolean
let hourlyPending: boolean
let fetcher: ReturnType<typeof vi.fn>
let onRefresh: () => void
let linkTargets: unknown[]
const refreshers = new Map<string, ReturnType<typeof vi.fn>>()

beforeEach(() => {
  linkTargets = []
  hourly = buckets()
  accessEnabled = true
  hourlyPending = false
  refreshers.clear()
  fetcher = vi.fn(async (url: string) => url.endsWith('/hourly') ? hourly : url.endsWith('/stats') ? null : { rows: [] })
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('computed', vue.computed)
  vi.stubGlobal('useModuleFlags', () => ({ accessLogs: accessEnabled, activityLogs: true, errorLogs: true }))
  vi.stubGlobal('useSessionFetch', () => fetcher)
  vi.stubGlobal('useAsyncData', async (key: string, handler: () => Promise<unknown>) => {
    const data = vue.ref<unknown>(null)
    const error = vue.ref<unknown>(null)
    const refresh = vi.fn(async () => {
      try { data.value = await handler(); error.value = null } catch (failure) { error.value = failure }
    })
    refreshers.set(key, refresh)
    await refresh()
    refresh.mockClear()
    return { data, error, pending: vue.ref(key === 'admin-log-access-hourly' && hourlyPending), refresh }
  })
})
afterEach(() => vi.unstubAllGlobals())

async function render(locale = 'en') {
  const messages = JSON.parse(readFileSync(new URL(`../../i18n/locales/${locale}.json`, import.meta.url), 'utf8')).admin.logs
  vi.stubGlobal('useI18n', () => ({ t: (key: string, values: Record<string, unknown> = {}) => {
    const message = key.split('.').slice(2).reduce((value, part) => value?.[part], messages)
    return typeof message === 'string' ? message.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? '')) : key
  } }))
  const app = vue.createSSRApp(Dashboard)
  for (const name of ['UButton', 'UAlert', 'USkeleton', 'UBadge', 'NuxtLink']) {
    app.component(name, vue.defineComponent({
      inheritAttrs: false,
      setup(_, { attrs, slots }) {
        if (name === 'NuxtLink') linkTargets.push(attrs.to)
        if (typeof attrs.onClick === 'function') onRefresh = attrs.onClick as () => void
        return () => vue.h('div', { ...attrs, 'data-component': name }, [attrs.title as string, slots.default?.()])
      }
    }))
  }
  return renderer.renderToString(app)
}

describe('hourly dashboard SFC integration', () => {
  it.each(['en', 'zh-CN'])('fetches the full hourly endpoint and renders UTC counts/5xx tooltips (%s)', async (locale) => {
    const html = await render(locale)
    expect(fetcher.mock.calls.some(([url]) => url === '/api/admin/logs/access/hourly')).toBe(true)
    expect(fetcher.mock.calls.some(([url]) => url === '/api/admin/logs/access')).toBe(false)
    expect(html.match(/title="2026-/g)).toHaveLength(24)
    expect(html).toContain('2026-05-20 23:00 UTC')
    expect(html).toContain('450')
    expect(html).toContain('15')
    expect(html).toContain('5xx')
    expect(html).toContain('height:100%')
    expect(html).toContain('height:0%')
  })

  it.each(['en', 'zh-CN'])('distinguishes estimated DB storage from measured access files (%s)', async (locale) => {
    fetcher.mockImplementation(async (url: string) => url.endsWith('/hourly') ? hourly : url.endsWith('/stats') ? {
      access: { count: 450 }, activity: { count: 5 }, errors: { count: 10 },
      db_estimate_bytes: 2 * 1024 * 1024, access_files_bytes: 1024 * 1024
    } : { rows: [] })
    const html = await render(locale)
    expect(html).toContain(locale === 'en' ? 'DB ~2.0 MB · Access files 1.0 MB' : '数据库约 2.0 MB · 访问日志文件 1.0 MB')
    expect(html).toContain('3.0 MB')
    expect(html).not.toContain(locale === 'en' ? 'DB estimate' : '数据库估算')
  })

  it('uses unread groups for the count and recent list, linking fingerprints to the inbox', async () => {
    fetcher.mockImplementation(async (url: string) => url.endsWith('/hourly') ? hourly : url.endsWith('/stats') ? {
      errors: { count: 999, groups: 10, unread_groups: 7 }, access: {}, activity: {}
    } : { rows: [{ fingerprint: '0123456789abcdef', id: 'error_groups:0123456789abcdef', normalized_message: 'broken <n>', route: '/api/test', count: 100, last_seen: '2026-01-01T00:00:00Z' }] })
    const html = await render()
    expect(fetcher).toHaveBeenCalledWith('/api/admin/logs/error-groups', { query: { status: 'unread', limit: 5, sort: 'last_seen' } })
    expect(html).toContain('Unread error groups')
    expect(html).toContain('>7<')
    expect(html).not.toContain('999')
    expect(linkTargets).toContainEqual({ path: '/admin/dashboard/logs/errors', query: { group: '0123456789abcdef' } })
    expect(html).toContain('broken &lt;n&gt;')
    expect(html).toContain('/api/test')
  })

  it('includes hourly data in Refresh alongside stats and recent errors', async () => {
    await render()
    fetcher.mockClear()
    hourly = buckets().map(bucket => ({ ...bucket, count: 1, errors: 0 }))
    onRefresh()
    await Promise.all([...refreshers.values()].map(refresh => refresh.mock.results[0]?.value))
    expect([...refreshers.keys()]).toEqual(['admin-log-stats', 'admin-log-access-hourly', 'admin-log-errors-recent'])
    expect([...refreshers.values()].every(refresh => refresh.mock.calls.length === 1)).toBe(true)
    expect(fetcher.mock.calls.some(([url]) => url === '/api/admin/logs/access/hourly')).toBe(true)
  })

  it('renders a loading skeleton instead of misleading zero traffic while hourly is pending', async () => {
    hourlyPending = true
    const html = await render()
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('data-component="USkeleton"')
    expect(html).not.toContain('title="2026-')
  })

  it('shows an hourly failure even when stats succeed, rather than an empty chart', async () => {
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith('/hourly')) throw new Error('Read failed')
      return url.endsWith('/stats') ? null : { rows: [] }
    })
    const html = await render()
    expect(html).toContain('data-component="UAlert"')
    expect(html).toContain('Could not load log dashboard')
    expect(html).not.toContain('title="2026-')
  })

  it('hides the chart and skips the hourly request when access logs are disabled', async () => {
    accessEnabled = false
    const html = await render()
    expect(fetcher.mock.calls.some(([url]) => url.endsWith('/hourly'))).toBe(false)
    expect(html).not.toContain('Requests per hour')
    expect(html).not.toContain('title="2026-')
  })
})
