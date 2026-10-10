import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { filterAdminSettings, normalizePublicSettings, PUBLIC_SETTING_KEYS } from '../../server/utils/settings'
import { assertPublicFeatureEnabled } from '../../server/utils/publicFeatures'

const mocks = vi.hoisted(() => ({ queryDb: vi.fn(), useDb: vi.fn(), readPublicBootstrap: vi.fn() }))
vi.mock('../../server/utils/db', () => ({ queryDb: mocks.queryDb, useDb: mocks.useDb }))
vi.mock('../../server/utils/users', () => ({}))
vi.mock('../../server/utils/posts', () => ({ ADMIN_POST_DISPLAY_MODE_KEY: 'admin_post_display_mode', normalizeAdminPostDisplayMode: vi.fn() }))
vi.mock('../../server/utils/publicBootstrap', () => ({ readPublicBootstrap: mocks.readPublicBootstrap }))

beforeEach(() => vi.resetAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('public feature settings', () => {
  it('publishes both keys through the public settings contract', () => {
    expect(PUBLIC_SETTING_KEYS).toContain('graph_view_enabled')
    expect(PUBLIC_SETTING_KEYS).toContain('publish_heatmap_enabled')
  })

  it('defaults to enabled and only a stored boolean false disables', () => {
    expect(normalizePublicSettings({})).toMatchObject({ graph_view_enabled: true, publish_heatmap_enabled: true })
    expect(normalizePublicSettings({ graph_view_enabled: false })).toMatchObject({ graph_view_enabled: false, publish_heatmap_enabled: true })
    expect(normalizePublicSettings({ publish_heatmap_enabled: 'no', graph_view_enabled: 0 })).toMatchObject({ graph_view_enabled: true, publish_heatmap_enabled: true })
  })

  it('coerces non-boolean writes to the default and still drops unknown keys', () => {
    expect(filterAdminSettings({ graph_view_enabled: false, publish_heatmap_enabled: true })).toEqual({ graph_view_enabled: false, publish_heatmap_enabled: true })
    expect(filterAdminSettings({ graph_view_enabled: 'false', publish_heatmap_enabled: null })).toEqual({ graph_view_enabled: true, publish_heatmap_enabled: true })
    expect(filterAdminSettings({ not_a_setting: false })).toEqual({})
  })

  it.each([
    ['graph_view_enabled', { graph_view_enabled: false, publish_heatmap_enabled: true }],
    ['publish_heatmap_enabled', { graph_view_enabled: true, publish_heatmap_enabled: false }]
  ] as const)('returns 404 when %s is turned off', async (key, settings) => {
    mocks.readPublicBootstrap.mockResolvedValue({ settings })
    await expect(assertPublicFeatureEnabled(key)).rejects.toMatchObject({ statusCode: 404 })
  })

  it.each([{ graph_view_enabled: true }, {}])('allows the endpoint when enabled or absent (%j)', async settings => {
    mocks.readPublicBootstrap.mockResolvedValue({ settings })
    await expect(assertPublicFeatureEnabled('graph_view_enabled')).resolves.toBeUndefined()
  })
})
