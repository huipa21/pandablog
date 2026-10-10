import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import { ModuleKind, transpileModule } from 'typescript'
import * as vue from 'vue'
import * as renderer from 'vue/server-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../../pages/admin/dashboard/logs/index.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'log-dashboard-test', inlineTemplate: true, templateOptions: { ssr: true } })
const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
const exports: Record<string, any> = {}
new Function('require', 'exports', code)((id: string) => {
  if (id === 'vue') return vue
  if (id === 'vue/server-renderer') return renderer
  throw new Error(`Unexpected dashboard import: ${id}`)
}, exports)
const Dashboard = exports.default
let fetcher: ReturnType<typeof vi.fn>, onRefresh: () => void, linkTargets: unknown[]
const refreshers = new Map<string, ReturnType<typeof vi.fn>>()
beforeEach(() => {
  linkTargets = []; refreshers.clear()
  fetcher = vi.fn(async (url: string) => url.endsWith('/stats') ? { activity: { count: 5 }, errors: { unread_groups: 7 }, db_estimate_bytes: 2 * 1024 * 1024 } : { rows: [] })
  vi.stubGlobal('definePageMeta', vi.fn()); vi.stubGlobal('computed', vue.computed)
  vi.stubGlobal('useSessionFetch', () => fetcher)
  vi.stubGlobal('useAsyncData', async (key: string, handler: () => Promise<unknown>) => {
    const data = vue.ref<unknown>(null), error = vue.ref<unknown>(null)
    const refresh = vi.fn(async () => { try { data.value = await handler(); error.value = null } catch (failure) { error.value = failure } })
    refreshers.set(key, refresh); await refresh(); refresh.mockClear()
    return { data, error, pending: vue.ref(false), refresh }
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
    app.component(name, vue.defineComponent({ inheritAttrs: false, setup(_, { attrs, slots }) {
      if (name === 'NuxtLink') linkTargets.push(attrs.to)
      if (typeof attrs.onClick === 'function') onRefresh = attrs.onClick as () => void
      return () => vue.h('div', { ...attrs, 'data-component': name }, [attrs.title as string, slots.default?.()])
    } }))
  }
  return renderer.renderToString(app)
}
describe('DB-only logging dashboard SFC', () => {
  it.each(['en', 'zh-CN'])('renders estimated DB storage and no Access UI/network requests (%s)', async locale => {
    const html = await render(locale)
    expect(html).toContain(locale === 'en' ? 'Estimated DB log storage' : '数据库日志存储估算')
    expect(html).toContain('2.0 MB')
    expect(linkTargets).not.toContain('/admin/dashboard/logs/access')
    expect(fetcher.mock.calls.every(([url]) => !url.includes('/access'))).toBe(true)
    expect([...refreshers.keys()]).toEqual(['admin-log-stats', 'admin-log-errors-recent'])
  })
  it('uses unread groups for count/list and links fingerprints to the inbox', async () => {
    fetcher.mockImplementation(async (url: string) => url.endsWith('/stats') ? { errors: { count: 999, groups: 10, unread_groups: 7 }, activity: {} } : { rows: [{ fingerprint: '0123456789abcdef', id: 'error_groups:0123456789abcdef', normalized_message: 'broken <n>', route: '/api/test', count: 100, last_seen: '2026-01-01T00:00:00Z' }] })
    const html = await render()
    expect(fetcher).toHaveBeenCalledWith('/api/admin/logs/error-groups', { query: { status: 'unread', limit: 5, sort: 'last_seen' } })
    expect(html).toContain('Unread error groups'); expect(html).toContain('>7<'); expect(html).not.toContain('999')
    expect(linkTargets).toContainEqual({ path: '/admin/dashboard/logs/errors', query: { group: '0123456789abcdef' } })
    expect(html).toContain('broken &lt;n&gt;'); expect(html).toContain('/api/test')
  })
  it('refreshes stats and recent errors only', async () => {
    await render(); fetcher.mockClear(); onRefresh()
    await Promise.all([...refreshers.values()].map(refresh => refresh.mock.results[0]?.value))
    expect([...refreshers.values()].every(refresh => refresh.mock.calls.length === 1)).toBe(true)
    expect(fetcher.mock.calls.every(([url]) => !url.includes('/access'))).toBe(true)
  })
  it('always links both log overviews and loads recent error groups (no build-time module switch)', async () => {
    await render()
    expect(linkTargets).toContain('/admin/dashboard/logs/activity')
    expect(linkTargets).toContain('/admin/dashboard/logs/errors')
    expect(fetcher.mock.calls.some(([url]) => url.includes('error-groups'))).toBe(true)
  })
})
