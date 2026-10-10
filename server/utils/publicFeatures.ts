import { createError } from 'h3'
import { readPublicBootstrap } from './publicBootstrap'

export type PublicFeatureKey = 'graph_view_enabled' | 'publish_heatmap_enabled'

/**
 * Throws 404 when an administrator has turned an optional public feature off.
 * Reads the cached public bootstrap (30 s TTL, invalidated on settings save).
 */
export async function assertPublicFeatureEnabled(key: PublicFeatureKey): Promise<void> {
  const { settings } = await readPublicBootstrap()
  if (settings[key] === false) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
}
