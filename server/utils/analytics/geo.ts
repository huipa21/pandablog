import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import maxmind, { type CityResponse, type Reader } from 'maxmind'
import type { AnalyticsGeo } from './types'

let readerPromise: Promise<Reader<CityResponse> | null> | null = null

export async function lookupAnalyticsGeo(ip: string): Promise<AnalyticsGeo> {
  if (!maxmind.validate(ip)) {
    return {}
  }

  const reader = await getGeoReader()
  if (!reader) {
    return {}
  }

  const result = reader.get(ip)
  if (!result) {
    return {}
  }

  const subdivision = result.subdivisions?.[0]
  return compactGeo({
    country: result.country?.iso_code,
    region: subdivision?.iso_code ?? preferredName(subdivision?.names),
    city: preferredName(result.city?.names)
  })
}

export function analyticsGeoDbPath() {
  const config = useRuntimeConfig()
  return resolve(String(config.geoipDbPath || 'storage/geoip/dbip-city-lite.mmdb'))
}

async function getGeoReader() {
  if (!readerPromise) {
    readerPromise = openGeoReader()
  }

  return readerPromise
}

async function openGeoReader() {
  const filePath = analyticsGeoDbPath()
  if (!existsSync(filePath)) {
    if (import.meta.dev) {
      console.warn(`[analytics] geo database not found at ${filePath}; geo fields will be empty`)
    }
    return null
  }

  try {
    return await maxmind.open<CityResponse>(filePath, { cache: { max: 10_000 } })
  } catch (error) {
    console.warn('[analytics] failed to open geo database:', error instanceof Error ? error.message : error)
    return null
  }
}

function preferredName(names: { en?: string } | undefined) {
  if (!names) {
    return undefined
  }

  return names.en ?? Object.values(names as Record<string, string>)[0]
}

function compactGeo(geo: AnalyticsGeo): AnalyticsGeo {
  return Object.fromEntries(
    Object.entries(geo).filter(([, value]) => typeof value === 'string' && value.length > 0)
  ) as AnalyticsGeo
}
