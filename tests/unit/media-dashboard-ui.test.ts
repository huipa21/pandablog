import { readFileSync } from 'node:fs'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, transpileModule } from 'typescript'
import * as vue from 'vue'
import * as renderer from 'vue/server-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../../pages/admin/dashboard/media.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, {id: 'media-dashboard-test', inlineTemplate: true, templateOptions: {ssr: true}})
const code = transpileModule(compiled.content, {compilerOptions: {module: ModuleKind.CommonJS}}).outputText
const exports: Record<string, any> = {}
new Function('require', 'exports', code)((id: string) => {
  if (id === 'vue') return vue
  if (id === 'vue/server-renderer') return renderer
  throw new Error(`Unexpected dashboard import: ${id}`)
}, exports)
const Dashboard = exports.default
let fetcher: ReturnType<typeof vi.fn>
let pending: boolean
let selectedRange: string | undefined
beforeEach(() => {
  pending = false
  selectedRange = undefined
  fetcher = vi.fn().mockResolvedValue({summary: {total_items: 0, total_storage: 0, average_size: 0}})
  for (const key of ['computed', 'watch'] as const) vi.stubGlobal(key, vue[key])
  vi.stubGlobal('ref', (value: unknown) => vue.ref(value === 'all' || value === '7d' ? selectedRange ?? value : value))
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('formatBytes', (bytes: number) => `${bytes} B`)
  vi.stubGlobal('useSessionFetch', () => fetcher)
  vi.stubGlobal('useAsyncData', async (_key: string, handler: () => Promise<unknown>) => {
    const data = vue.ref<unknown>(null), error = vue.ref<unknown>(null)
    try {data.value = await handler()} catch (failure) {error.value = failure}
    return {data, error, pending: vue.ref(pending), refresh: vi.fn()}
  })
})
afterEach(() => vi.unstubAllGlobals())
async function render(locale = 'en') {
  const messages = JSON.parse(readFileSync(new URL(`../../i18n/locales/${locale}.json`, import.meta.url), 'utf8'))
  vi.stubGlobal('useI18n', () => ({locale: vue.ref(locale), t: (key: string, values: Record<string, unknown> = {}) => {
    const message = key.split('.').reduce((value, part) => value?.[part], messages)
    return typeof message === 'string' ? message.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? '')) : key
  }}))
  const app = vue.createSSRApp(Dashboard)
  for (const name of ['USelect', 'UInput', 'UButton', 'UAlert', 'USkeleton', 'UIcon', 'NuxtLink', 'UBadge']) app.component(name, vue.defineComponent({
    inheritAttrs: false,
    setup(_, {attrs, slots}) {
      return () => vue.h('div', {'data-component': name}, [attrs.title as string, slots.default?.()])
    }
  }))
  return renderer.renderToString(app)
}

describe('real media dashboard SFC SSR', () => {
  it('requests all-time inventory by default and displays older uploads', async () => {
    fetcher.mockResolvedValue({summary: {total_items: 2, total_storage: 200, average_size: 100}})
    const html = await render()
    expect(fetcher).toHaveBeenCalledWith('/api/admin/dashboard/media', {query: {range: 'all'}})
    expect(html).toContain('>2<')
    expect(html).toContain('200 B')
  })
  it.each(['en', 'zh-CN'])('shows a load failure without fabricated zeros or empty-library messages (%s)', async locale => {
    fetcher.mockRejectedValue(new Error('Database offline'))
    const html = await render(locale)
    expect(html).toContain(locale === 'en' ? 'Could not load media dashboard' : '无法加载媒体仪表盘')
    expect(html).not.toContain('0 B')
    expect(html).not.toContain('>0<')
    expect(html).not.toContain(locale === 'en' ? 'No media uploaded yet.' : '暂无上传的媒体。')
    expect(html).not.toContain(locale === 'en' ? 'No files to show.' : '暂无文件可显示。')
  })
  it.each(['en', 'zh-CN'])('keeps genuine empty-library messages for successful all-time responses (%s)', async locale => {
    const html = await render(locale)
    expect(html).toContain(locale === 'en' ? 'No media uploaded yet.' : '暂无上传的媒体。')
    expect(html).toContain('0 B')
    expect(html).not.toContain('data-component="UAlert"')
  })
  it.each(['en', 'zh-CN'])('uses range-specific empty messages for a successful filtered response (%s)', async locale => {
    selectedRange = '7d'
    const html = await render(locale)
    expect(fetcher).toHaveBeenCalledWith('/api/admin/dashboard/media', {query: {range: '7d'}})
    expect(html).toContain(locale === 'en' ? 'No uploads in this range.' : '此范围内暂无上传。')
    expect(html).toContain(locale === 'en' ? 'No storage used in this range.' : '此范围内暂无存储占用。')
    expect(html).not.toContain(locale === 'en' ? 'No media uploaded yet.' : '暂无上传的媒体。')
    expect(html).not.toContain(locale === 'en' ? '>No storage used yet.<' : '>暂无存储占用。<')
  })
  it('keeps loading skeletons instead of zero scorecards', async () => {
    pending = true
    const html = await render()
    expect(html).toContain('data-component="USkeleton"')
    expect(html).not.toContain('0 B')
    expect(html).not.toContain('>0<')
  })
})
