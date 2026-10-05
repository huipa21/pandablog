import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { parse, compileScript } from '@vue/compiler-sfc'
import { ModuleKind, transpileModule } from 'typescript'
import * as vue from 'vue'
import * as renderer from 'vue/server-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as accessUi from '../../utils/loggingAccessUi'
import * as loggingSettings from '../../utils/loggingSettings'

// Exercise the actual SFCs, with no configured DB, storage or application server.
function compile(path: string) {
  const source = readFileSync(new NodeURL(`../../${path}`, import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: path, inlineTemplate: true, templateOptions: { ssr: true } })
  const code = transpileModule(compiled.content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: Record<string, any> = {}
  new Function('require', 'exports', code)((id: string) => {
    if (id === 'vue') return vue
    if (id === 'vue/server-renderer') return renderer
    if (id === '~/utils/loggingAccessUi') return accessUi
    if (id === '~/utils/loggingSettings') return loggingSettings
    throw new Error(`Unexpected SFC import: ${id}`)
  }, exports)
  return exports.default
}
const Access = compile('pages/admin/dashboard/logs/access.vue')
const Pagination = compile('components/admin/LogPagination.vue')
const Settings = compile('pages/admin/dashboard/logs/settings.vue')
const now = '2026-05-20T10:12:03.123Z'
let route: { query: Record<string, any> }
let fetcher: ReturnType<typeof vi.fn>
let replace: ReturnType<typeof vi.fn>
let settings: Record<string, any>
let result: Record<string, any>
let pending: boolean
const controls: Array<{ name: string, attrs: Record<string, any>, parent: any }> = []
const refreshers = new Map<string, ReturnType<typeof vi.fn>>()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(now))
  route = vue.reactive({ query: {} })
  settings = { retention_access_days: 14, retention_activity_days: 365, retention_error_days: 90 }
  result = { rows: [{ id: '2026-05-20:request', timestamp: now, method: 'GET', path: '/hello', status_code: 200, response_time_ms: 4 }], total: 123, limit: 50, offset: 0, truncated: false }
  pending = false
  controls.length = 0
  refreshers.clear()
  fetcher = vi.fn(async (url: string) => {
    if (url.endsWith('/settings/logging')) return { settings }
    if (url.endsWith('/retention')) return { last: null, schedule: '17 3 * * *' }
    if (url.endsWith('/export')) return 'id,path\nrequest,/hello'
    return result
  })
  replace = vi.fn(async ({ query }: { query: Record<string, any> }) => { route.query = query })
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('computed', vue.computed)
  vi.stubGlobal('ref', vue.ref)
  vi.stubGlobal('reactive', vue.reactive)
  // SSR normally stops watchers on teardown; keep these synchronous for captured event tests.
  vi.stubGlobal('watch', (source: any, callback: any, options: any = {}) => vue.watch(source, callback, { ...options, flush: 'sync' }))
  vi.stubGlobal('onBeforeUnmount', vue.onBeforeUnmount)
  vi.stubGlobal('clearNuxtState', vi.fn())
  vi.stubGlobal('useState', (_key: string, init: () => unknown) => vue.ref(init()))
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => ({ replace }))
  vi.stubGlobal('useSessionFetch', () => fetcher)
  vi.stubGlobal('useAdminToast', () => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }))
  vi.stubGlobal('useAdminRegionalSettings', () => ({ formatAdminDateTime: String, formatAdminNumber: String }))
  vi.stubGlobal('useAsyncData', async (key: string, handler: () => Promise<unknown>, options: any = {}) => {
    const data = vue.ref<unknown>(null)
    const error = vue.ref<unknown>(null)
    const refresh = vi.fn(async () => {
      try { data.value = await handler(); error.value = null } catch (failure) { error.value = failure }
    })
    refreshers.set(key, refresh)
    await refresh()
    refresh.mockClear()
    if (options.watch) vue.watch(options.watch, () => { void refresh() }, { flush: 'sync' })
    return { data, error, pending: vue.ref(key === 'admin-access-logs-list' && pending), refresh }
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

async function render(component: any, locale = 'en', props: Record<string, unknown> = {}) {
  const messages = JSON.parse(readFileSync(new NodeURL(`../../i18n/locales/${locale}.json`, import.meta.url), 'utf8'))
  vi.stubGlobal('useI18n', () => ({ t: (key: string, values: Record<string, unknown> = {}) => {
    const message = key.split('.').reduce((value, part) => value?.[part], messages)
    return typeof message === 'string' ? message.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? '')) : key
  } }))
  const app = vue.createSSRApp(component, props)
  app.component('AdminLogPagination', Pagination)
  for (const name of ['UButton', 'UAlert', 'USkeleton', 'UInput', 'USelect', 'UFormField', 'USwitch', 'UTextarea', 'AdminLogDetailDialog', 'AdminConfirmActionDialog']) {
    app.component(name, vue.defineComponent({
      inheritAttrs: false,
      setup(_, { attrs, slots }) {
        controls.push({ name, attrs, parent: vue.getCurrentInstance()!.parent })
        return () => vue.h('div', { ...attrs, 'data-component': name }, [String(attrs.title ?? ''), String(attrs.label ?? ''), String(attrs.description ?? ''), slots.default?.(), slots.hint?.(), slots.description?.()])
      }
    }))
  }
  return renderer.renderToString(app)
}
const button = (icon: string) => controls.find(control => control.name === 'UButton' && control.attrs.icon === icon)!.attrs
const picker = () => controls.filter(control => control.name === 'UInput' && control.attrs.type === 'datetime-local')
const listQuery = () => fetcher.mock.calls.find(([url]) => url === '/api/admin/logs/access')![1].query

function mockDownload() {
  const anchor = { href: '', download: '', click: vi.fn() }
  const createObjectURL = vi.fn(() => 'blob:export')
  const revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
  vi.stubGlobal('document', { createElement: vi.fn(() => anchor) })
  return { anchor, createObjectURL, revokeObjectURL }
}

describe('file-backed Access UI', () => {
  it.each(['en', 'zh-CN'])('fetches/displays the default 24h window with saved retention bounds (%s)', async locale => {
    const html = await render(Access, locale)
    expect(fetcher.mock.calls[0]![0]).toBe('/api/admin/settings/logging')
    expect(listQuery()).toEqual({ from: '2026-05-19T10:12:03.123Z', to: now, total: 'true' })
    expect(picker().map(({ attrs }) => attrs.modelValue)).toEqual(['2026-05-19T10:12:03.123', '2026-05-20T10:12:03.123'])
    expect(picker().every(({ attrs }) => attrs.min === '2026-05-06T00:00:00.000' && attrs.max === '2026-05-20T10:12:03.123')).toBe(true)
    expect(html).toContain('UTC')
    expect(html).toContain('14')
    expect(html).not.toContain('admin.logs.accessDateRangeHint')
  })

  it('preserves deep-linked filters and offsets while enforcing retention on initial fetch', async () => {
    route.query = { from: '2026-01-01', to: '2026-05-18T00:00:00Z', path: '/hello', method: 'GET', offset: '50', total: 'false' }
    await render(Access)
    expect(listQuery()).toEqual({ ...route.query, from: '2026-05-06T00:00:00.000Z', to: '2026-05-18T00:00:00.000Z', total: 'true' })
  })

  it('exports the same initial default window rather than the reader default, with a 10K cap', async () => {
    const download = mockDownload()
    await render(Access)
    const initial = listQuery()
    await button('i-lucide-download').onClick()
    expect(fetcher).toHaveBeenLastCalledWith('/api/admin/logs/access/export', { query: { ...initial, format: 'csv', limit: '10000', offset: '0' }, responseType: 'text' })
    expect(download.anchor.download).toBe('access-logs.csv')
    expect(download.anchor.click).toHaveBeenCalledOnce()
    expect(download.revokeObjectURL).toHaveBeenCalledWith('blob:export')
  })

  it('applies edited UTC dates and resets the page, without a timezone shift or duplicate refresh', async () => {
    await render(Access)
    picker()[0]!.attrs['onUpdate:modelValue']('2026-05-07T03:04:05.678')
    picker()[1]!.attrs['onUpdate:modelValue']('2026-05-08T03:04:05.678')
    await button('i-lucide-filter').onClick()
    expect(replace.mock.calls[0]![0].query).toMatchObject({ from: '2026-05-07T03:04:05.678Z', to: '2026-05-08T03:04:05.678Z', offset: '0' })
    expect(refreshers.get('admin-access-logs-list')).toHaveBeenCalledOnce()
  })

  it('normalizes out-of-retention edits in both the submitted query and picker values', async () => {
    await render(Access)
    picker()[0]!.attrs['onUpdate:modelValue']('2026-01-01T00:00:00.000')
    picker()[1]!.attrs['onUpdate:modelValue']('2026-06-01T00:00:00.000')
    await button('i-lucide-filter').onClick()
    expect(replace.mock.calls[0]![0].query).toMatchObject({ from: '2026-05-06T00:00:00.000Z', to: now })
    const parent = controls.find(control => control.name === 'AdminLogDetailDialog')!.parent
    controls.length = 0
    await render({ __ssrInlineRender: true, setup: () => parent.ssrRender })
    expect(picker().map(({ attrs }) => attrs.modelValue)).toEqual(['2026-05-06T00:00:00.000', '2026-05-20T10:12:03.123'])
  })

  it('retains exact pagination labels for other log tabs that omit the optional truncation prop', async () => {
    const html = await render(Pagination, 'en', { total: 123, limit: 50, offset: 50 })
    expect(html).toContain('Showing 51-100 of 123')
    expect(html).not.toContain('123+')
    expect(button('i-lucide-chevrons-right').disabled).toBe(false)
  })

  it('pages and exports applied dates/filters, not unsaved input edits', async () => {
    const download = mockDownload()
    route.query = { from: '2026-05-07T00:00:00Z', to: '2026-05-09T00:00:00Z', path: '/hello' }
    await render(Access)
    picker()[0]!.attrs['onUpdate:modelValue']('2026-05-08T00:00:00.000')
    const initial = listQuery()
    button('i-lucide-chevron-right').onClick()
    await vue.nextTick()
    expect(replace.mock.calls[0]![0].query).toEqual({ ...initial, offset: '50' })
    await button('i-lucide-download').onClick()
    expect(fetcher.mock.calls.at(-1)![1].query).toEqual({ ...initial, offset: '0', format: 'csv', limit: '10000' })
    expect(download.anchor.click).toHaveBeenCalledOnce()
  })

  it('Clear restores a fresh last-24h window instead of clearing dates', async () => {
    route.query = { from: '2026-05-06', to: '2026-05-07', search: 'bot', offset: '100' }
    await render(Access)
    vi.setSystemTime(new Date('2026-05-20T11:00:00Z'))
    button('i-lucide-eraser').onClick()
    await vue.nextTick()
    expect(replace.mock.calls.at(-1)![0].query).toEqual({ from: '2026-05-19T11:00:00.000Z', to: '2026-05-20T11:00:00.000Z', sort: 'newest', limit: '50', offset: '0' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['en', 'zh-CN'])('renders a translated truncation warning and lower-bound totals (%s)', async locale => {
    result.truncated = true
    const html = await render(Access, locale)
    expect(html).toContain('123+')
    expect(html).toContain('3+')
    expect(html).toContain(locale === 'en' ? 'Showing first results; narrow the date range for exact totals' : '仅显示部分结果；请缩小日期范围以获取准确总数')
    expect(button('i-lucide-chevrons-right').disabled).toBe(true)
    expect(button('i-lucide-chevron-right').disabled).toBe(false)
  })

  it('still presents a zero lower bound and warning when a scan stops before finding matches', async () => {
    result = { ...result, rows: [], total: 0, truncated: true }
    const html = await render(Access)
    expect(html).toContain('Showing 0-0 of 0+')
    expect(html).toContain('Showing first results')
  })

  it('does not warn or add plus signs for complete results, or while loading', async () => {
    let html = await render(Access)
    expect(html).toContain('Showing 1-50 of 123')
    expect(html).not.toContain('123+')
    expect(button('i-lucide-chevrons-right').disabled).toBe(false)
    result.truncated = true
    pending = true
    html = await render(Access)
    expect(html).not.toContain('Showing first results')
    expect(html).not.toContain('123+')
  })

  it('keeps browsing available with a visible settings failure and fallback retention', async () => {
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith('/settings/logging')) throw new Error('settings unavailable')
      return result
    })
    const html = await render(Access)
    expect(html).toContain('Could not load logging settings')
    expect(picker()[0]!.attrs.min).toBe('2026-04-20T00:00:00.000')
    expect(listQuery().from).toBe('2026-05-19T10:12:03.123Z')
  })

  it('renders file-backed rows alongside the existing detail dialog', async () => {
    result.rows[0].status_code = 503
    const html = await render(Access)
    expect(html).toContain('/hello')
    expect(html).toContain('503')
    expect(html).toContain('4ms')
    const dialog = controls.find(control => control.name === 'AdminLogDetailDialog')!
    expect(dialog.attrs.open).toBe(false)
  })
})

describe('file-store settings UI', () => {
  it.each(['en', 'zh-CN'])('shows dynamic daily file retention and only age cleanup for access (%s)', async locale => {
    const html = await render(Settings, locale)
    expect(html).toContain(locale === 'en' ? 'Access log files older than 14 days are deleted daily.' : '每天删除早于 14 天的访问日志文件。')
    const cleanup = html.slice(html.indexOf('id="cleanup"'))
    const accessSection = cleanup.slice(0, cleanup.indexOf(locale === 'en' ? 'Activity logs' : '活动日志'))
    expect(accessSection).toContain(locale === 'en' ? 'whole day files' : '整日文件')
    expect(accessSection).not.toContain('keep_latest')
    expect(cleanup.match(/value="keep_latest"/g)).toHaveLength(2)
    expect(accessSection).toContain(locale === 'en' ? 'UTC day is before the cutoff day' : '早于 UTC 截止日')
    expect(html).not.toContain('admin.logs.settings.deleteAccessFilesDescription')
  })

  it.each(['en', 'zh-CN'])('uses whole-UTC-day file semantics in the access deletion confirmation (%s)', async locale => {
    await render(Settings, locale)
    const run = controls.find(control => control.name === 'UButton' && control.attrs.icon === 'i-lucide-trash-2')!
    run.attrs.onClick()
    // Re-render the real setup's SSR closure after the captured event (SSR has no DOM patch loop).
    const parent = controls.find(control => control.name === 'AdminConfirmActionDialog')!.parent
    controls.length = 0
    await render({ __ssrInlineRender: true, setup: () => parent.ssrRender }, locale)
    const dialog = controls.find(control => control.name === 'AdminConfirmActionDialog')!
    expect(dialog.attrs.open).toBe(true)
    expect(dialog.attrs.description).toContain('14')
    expect(dialog.attrs.description).toContain('UTC')
    expect(dialog.attrs.description).toContain(locale === 'en' ? "The cutoff day's file is kept" : '保留截止日当天的文件')
    expect(dialog.attrs.description).toContain(locale === 'en' ? 'cannot be undone' : '无法撤销')
  })
})
