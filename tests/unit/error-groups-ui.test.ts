import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import { ModuleKind, transpileModule } from 'typescript'
import * as vue from 'vue'
import * as renderer from 'vue/server-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../../pages/admin/dashboard/logs/errors.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'error-inbox-test', inlineTemplate: true, templateOptions: { ssr: true } })
const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
const exports: Record<string, any> = {}
new Function('require', 'exports', code)((id: string) => {
  if (id === 'vue') return vue
  if (id === 'vue/server-renderer') return renderer
  throw new Error(`Unexpected error inbox import: ${id}`)
}, exports)
const Inbox = exports.default
const fp = '0123456789abcdef'
let fetcher: ReturnType<typeof vi.fn>
let query: Record<string, unknown>
let pending: boolean
let failure: unknown
let clickHandlers: Array<() => Promise<void> | void>
beforeEach(() => {
  query = {}; pending = false; failure = null; clickHandlers = []
  fetcher = vi.fn().mockResolvedValue({ rows: [{ fingerprint: fp, message: 'bad post:123', normalized_message: 'bad <rid>', route: '/api/posts/:id', count: 100, regressed: true, first_seen: '2026-01-01T00:00:00Z', last_seen: '2026-01-02T00:00:00Z' }], total: 1, limit: 50, offset: 0 })
  for (const key of ['ref', 'reactive', 'computed', 'watch', 'onBeforeUnmount'] as const) vi.stubGlobal(key, vue[key])
  vi.stubGlobal('onMounted', vi.fn())
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useState', (_key: string, init: () => unknown) => vue.ref(init()))
  vi.stubGlobal('useRoute', () => ({ query }))
  vi.stubGlobal('useRouter', () => ({ replace: vi.fn() }))
  vi.stubGlobal('useAdminToast', () => ({ success: vi.fn(), error: vi.fn() }))
  vi.stubGlobal('useSessionFetch', () => fetcher)
  vi.stubGlobal('useAsyncData', async (_key: string, handler: () => Promise<unknown>) => ({ data: vue.ref(await handler()), pending: vue.ref(pending), error: vue.ref(failure), refresh: vi.fn() }))
})
afterEach(() => vi.unstubAllGlobals())
async function render(locale = 'en') {
  const messages = JSON.parse(readFileSync(new URL(`../../i18n/locales/${locale}.json`, import.meta.url), 'utf8'))
  vi.stubGlobal('useI18n', () => ({ locale: vue.ref(locale), t: (key: string, values: Record<string, unknown> = {}) => {
    const message = key.split('.').reduce((value, part) => value?.[part], messages)
    return typeof message === 'string' ? message.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? '')) : key
  } }))
  const app = vue.createSSRApp(Inbox)
  for (const name of ['UButton', 'UInput', 'USelect', 'UBadge', 'UDropdownMenu', 'USkeleton', 'UAlert', 'AdminLogPagination']) app.component(name, vue.defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      if (typeof attrs.onClick === 'function') clickHandlers.push(attrs.onClick as () => void)
      return () => vue.h('div', { ...attrs, 'data-component': name }, [attrs.title as string, slots.default?.()])
    }
  }))
  for (const name of ['UModal', 'AdminLogDetailDialog', 'AdminConfirmActionDialog']) app.component(name, vue.defineComponent({ setup: () => () => null }))
  return renderer.renderToString(app)
}

describe('real error inbox SFC SSR', () => {
  it.each(['en', 'zh-CN'])('renders grouped counts, status/tabs, normalized messages and route (%s)', async locale => {
    const html = await render(locale)
    expect(fetcher).toHaveBeenCalledWith('/api/admin/logs/error-groups', { query: {} })
    expect(html).toContain(locale === 'en' ? 'Error inbox' : '错误收件箱')
    expect(html).toContain(locale === 'en' ? 'Regressed' : '再次发生')
    expect(html).toContain('bad &lt;rid&gt;')
    expect(html).toContain('/api/posts/:id')
    expect(html).toContain('100')
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('2026-01-01T00:00:00Z')
  })
  it('forwards only validated group query fields, never the dashboard deep-link group id', async () => {
    query = { status: 'resolved', sort: 'count', limit: '25', search: 'bad', group: fp }
    const html = await render()
    expect(fetcher).toHaveBeenCalledWith('/api/admin/logs/error-groups', { query: { status: 'resolved', sort: 'count', limit: '25', search: 'bad' } })
    expect(html).toContain('Resolved')
  })
  it('shows an actionable error state and loading skeleton', async () => {
    failure = new Error('DB offline'); pending = true
    const html = await render()
    expect(html).toContain('Could not load error groups or occurrences')
    expect(html).toContain('data-component="USkeleton"')
  })
  it('exports occurrences through the concrete route with group status/sort removed', async () => {
    query = { status: 'unread', sort: 'count', from: '2026-01-01T00:00:00Z', search: 'bad' }
    await render()
    const anchor = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: () => anchor })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    fetcher.mockResolvedValueOnce('csv-content')
    // Apply, Clear, Refresh, Export are the first four non-tab controls.
    await clickHandlers[6]!()
    expect(fetcher.mock.calls.at(-1)).toEqual(['/api/admin/logs/errors/export', { query: { from: '2026-01-01T00:00:00Z', search: 'bad', format: 'csv', sort: 'newest', limit: '10000', offset: '0' }, responseType: 'text' }])
    expect(anchor.click).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
  })
})
