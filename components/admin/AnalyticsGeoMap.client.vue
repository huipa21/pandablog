<template>
  <div class="analytics-geo-map" role="img" :aria-label="ariaLabel">
    <div class="analytics-geo-map-visual" aria-hidden="true">
      <VisSingleContainer
        class="analytics-geo-map-topology"
        :data="mapData"
        :height="360"
        :margin="{ left: 12, right: 12, top: 10, bottom: 10 }"
      >
        <VisTopoJSONMap
          class="analytics-geo-map-layer"
          :topojson="WorldMapTopoJSON"
          map-feature-name="countries"
          :projection="mapProjection"
          :duration="450"
          :disable-zoom="true"
          :area-color="areaColor"
          :point-color="markerColor"
          :point-radius="markerRadius"
          :point-id="markerId"
          :longitude="markerLongitude"
          :latitude="markerLatitude"
        />
      </VisSingleContainer>
    </div>

    <div v-if="markers.length" class="analytics-geo-map-legend" aria-hidden="true">
      <span>{{ lessLabel }}</span>
      <span class="analytics-geo-map-legend-swatch analytics-geo-map-legend-swatch-low" />
      <span class="analytics-geo-map-legend-swatch analytics-geo-map-legend-swatch-mid" />
      <span class="analytics-geo-map-legend-swatch analytics-geo-map-legend-swatch-high" />
      <span>{{ moreLabel }}</span>
    </div>
    <p v-else class="analytics-geo-map-empty">{{ emptyLabel }}</p>
  </div>
</template>

<script setup lang="ts">
import { MapProjection } from '@unovis/ts'
import { WorldMapTopoJSON } from '@unovis/ts/maps'
import { VisSingleContainer, VisTopoJSONMap } from '@unovis/vue'

interface GeoLocation {
  country: string
  region: string
  city: string
  views: number
}

interface CountryPoint {
  lat: number
  lon: number
}

interface HeatMarker {
  country: string
  latitude: number
  longitude: number
  radius: number
  color: string
  title: string
  views: number
}

interface HeatArea {
  id: string
  color: string
  views: number
}

interface CountryTraffic {
  country: string
  views: number
  ratio: number
  color: string
}

const props = defineProps<{
  locations: GeoLocation[]
  ariaLabel: string
  emptyLabel: string
  lessLabel: string
  moreLabel: string
}>()

const { locale } = useI18n()
const numberFormatter = computed(() => new Intl.NumberFormat(locale.value))
const countryDisplayNames = computed(() => {
  if (typeof Intl.DisplayNames !== 'function') {
    return null
  }

  return new Intl.DisplayNames([locale.value], { type: 'region' })
})

const mapProjection = MapProjection.NaturalEarth1()

const countryTraffic = computed<CountryTraffic[]>(() => {
  const countryViews = new Map<string, number>()
  for (const location of props.locations) {
    const country = location.country.trim().toUpperCase()
    if (!country) {
      continue
    }

    countryViews.set(country, (countryViews.get(country) ?? 0) + location.views)
  }

  const maxViews = Math.max(1, ...countryViews.values())
  return Array.from(countryViews.entries())
    .map(([country, views]) => {
      const ratio = views / maxViews
      return {
        country,
        views,
        ratio,
        color: heatColor(ratio)
      }
    })
    .sort((first, second) => second.views - first.views)
})

const areas = computed<HeatArea[]>(() => countryTraffic.value.map((traffic) => ({
  id: traffic.country,
  color: heatAreaColor(traffic.ratio),
  views: traffic.views
})))

const markers = computed<HeatMarker[]>(() => countryTraffic.value
  .map((traffic) => {
    const point = COUNTRY_POINTS[traffic.country]
    if (!point) {
      return null
    }

    return {
      country: traffic.country,
      views: traffic.views,
      latitude: point.lat,
      longitude: point.lon,
      radius: 4 + Math.sqrt(traffic.ratio) * 15,
      color: traffic.color,
      title: `${countryLabel(traffic.country)}: ${numberFormatter.value.format(traffic.views)}`
    }
  })
  .filter((marker): marker is HeatMarker => marker !== null))

const mapData = computed(() => ({
  areas: areas.value,
  points: markers.value
}))

const areaColor = (area: HeatArea) => area.color
const markerColor = (marker: HeatMarker) => marker.color
const markerRadius = (marker: HeatMarker) => marker.radius
const markerId = (marker: HeatMarker) => marker.country
const markerLongitude = (marker: HeatMarker) => marker.longitude
const markerLatitude = (marker: HeatMarker) => marker.latitude


function countryLabel(country: string) {
  return countryDisplayNames.value?.of(country) ?? country
}

function heatColor(ratio: number) {
  if (ratio >= 0.72) return '#dc2626'
  if (ratio >= 0.38) return '#f59e0b'
  return '#0d9488'
}

function heatAreaColor(ratio: number) {
  if (ratio >= 0.72) return '#fca5a5'
  if (ratio >= 0.38) return '#fcd34d'
  return '#5eead4'
}

const COUNTRY_POINTS: Record<string, CountryPoint> = {
  AD: { lat: 42.5, lon: 1.6 },
  AE: { lat: 24.0, lon: 54.0 },
  AF: { lat: 33.0, lon: 66.0 },
  AG: { lat: 17.1, lon: -61.8 },
  AL: { lat: 41.0, lon: 20.0 },
  AM: { lat: 40.0, lon: 45.0 },
  AO: { lat: -12.5, lon: 18.5 },
  AR: { lat: -34.0, lon: -64.0 },
  AT: { lat: 47.5, lon: 14.5 },
  AU: { lat: -25.0, lon: 133.0 },
  AZ: { lat: 40.5, lon: 47.5 },
  BA: { lat: 44.0, lon: 18.0 },
  BB: { lat: 13.2, lon: -59.5 },
  BD: { lat: 24.0, lon: 90.0 },
  BE: { lat: 50.8, lon: 4.0 },
  BF: { lat: 13.0, lon: -2.0 },
  BG: { lat: 43.0, lon: 25.0 },
  BH: { lat: 26.0, lon: 50.6 },
  BI: { lat: -3.5, lon: 30.0 },
  BJ: { lat: 9.5, lon: 2.3 },
  BN: { lat: 4.5, lon: 114.7 },
  BO: { lat: -17.0, lon: -65.0 },
  BR: { lat: -10.0, lon: -55.0 },
  BS: { lat: 24.3, lon: -76.0 },
  BT: { lat: 27.5, lon: 90.5 },
  BW: { lat: -22.0, lon: 24.0 },
  BY: { lat: 53.0, lon: 28.0 },
  BZ: { lat: 17.2, lon: -88.7 },
  CA: { lat: 56.0, lon: -106.0 },
  CD: { lat: -2.5, lon: 23.5 },
  CF: { lat: 7.0, lon: 21.0 },
  CG: { lat: -1.0, lon: 15.0 },
  CH: { lat: 47.0, lon: 8.0 },
  CI: { lat: 7.5, lon: -5.5 },
  CL: { lat: -30.0, lon: -71.0 },
  CM: { lat: 6.0, lon: 12.0 },
  CN: { lat: 35.0, lon: 103.0 },
  CO: { lat: 4.0, lon: -72.0 },
  CR: { lat: 10.0, lon: -84.0 },
  CU: { lat: 21.5, lon: -80.0 },
  CY: { lat: 35.0, lon: 33.0 },
  CZ: { lat: 49.8, lon: 15.5 },
  DE: { lat: 51.0, lon: 10.0 },
  DJ: { lat: 11.8, lon: 42.6 },
  DK: { lat: 56.0, lon: 10.0 },
  DO: { lat: 19.0, lon: -70.7 },
  DZ: { lat: 28.0, lon: 3.0 },
  EC: { lat: -1.5, lon: -78.0 },
  EE: { lat: 59.0, lon: 26.0 },
  EG: { lat: 26.0, lon: 30.0 },
  ER: { lat: 15.0, lon: 39.0 },
  ES: { lat: 40.0, lon: -4.0 },
  ET: { lat: 8.0, lon: 38.0 },
  FI: { lat: 64.0, lon: 26.0 },
  FJ: { lat: -18.0, lon: 178.0 },
  FR: { lat: 46.0, lon: 2.0 },
  GA: { lat: -0.8, lon: 11.6 },
  GB: { lat: 54.0, lon: -2.0 },
  GE: { lat: 42.0, lon: 43.5 },
  GH: { lat: 8.0, lon: -2.0 },
  GM: { lat: 13.5, lon: -15.5 },
  GN: { lat: 10.5, lon: -10.5 },
  GQ: { lat: 1.5, lon: 10.0 },
  GR: { lat: 39.0, lon: 22.0 },
  GT: { lat: 15.5, lon: -90.3 },
  GW: { lat: 12.0, lon: -15.0 },
  GY: { lat: 5.0, lon: -59.0 },
  HK: { lat: 22.3, lon: 114.2 },
  HN: { lat: 15.0, lon: -86.5 },
  HR: { lat: 45.1, lon: 15.2 },
  HT: { lat: 19.0, lon: -72.4 },
  HU: { lat: 47.0, lon: 20.0 },
  ID: { lat: -2.0, lon: 118.0 },
  IE: { lat: 53.0, lon: -8.0 },
  IL: { lat: 31.5, lon: 34.8 },
  IN: { lat: 22.0, lon: 79.0 },
  IQ: { lat: 33.0, lon: 44.0 },
  IR: { lat: 32.0, lon: 53.0 },
  IS: { lat: 65.0, lon: -18.0 },
  IT: { lat: 42.8, lon: 12.8 },
  JM: { lat: 18.1, lon: -77.3 },
  JO: { lat: 31.0, lon: 36.0 },
  JP: { lat: 36.0, lon: 138.0 },
  KE: { lat: 0.5, lon: 38.0 },
  KG: { lat: 41.0, lon: 75.0 },
  KH: { lat: 13.0, lon: 105.0 },
  KP: { lat: 40.0, lon: 127.0 },
  KR: { lat: 36.0, lon: 128.0 },
  KW: { lat: 29.5, lon: 47.8 },
  KZ: { lat: 48.0, lon: 68.0 },
  LA: { lat: 18.0, lon: 105.0 },
  LB: { lat: 33.8, lon: 35.8 },
  LK: { lat: 7.0, lon: 81.0 },
  LR: { lat: 6.5, lon: -9.5 },
  LS: { lat: -29.5, lon: 28.3 },
  LT: { lat: 55.0, lon: 24.0 },
  LU: { lat: 49.8, lon: 6.1 },
  LV: { lat: 57.0, lon: 25.0 },
  LY: { lat: 27.0, lon: 17.0 },
  MA: { lat: 32.0, lon: -6.0 },
  MD: { lat: 47.0, lon: 29.0 },
  ME: { lat: 42.7, lon: 19.3 },
  MG: { lat: -20.0, lon: 47.0 },
  MK: { lat: 41.6, lon: 21.7 },
  ML: { lat: 17.0, lon: -4.0 },
  MM: { lat: 21.0, lon: 96.0 },
  MN: { lat: 46.0, lon: 105.0 },
  MO: { lat: 22.2, lon: 113.5 },
  MR: { lat: 20.0, lon: -12.0 },
  MT: { lat: 35.9, lon: 14.4 },
  MU: { lat: -20.2, lon: 57.5 },
  MW: { lat: -13.5, lon: 34.0 },
  MX: { lat: 23.0, lon: -102.0 },
  MY: { lat: 4.0, lon: 102.0 },
  MZ: { lat: -18.3, lon: 35.5 },
  NA: { lat: -22.0, lon: 17.0 },
  NE: { lat: 17.0, lon: 9.0 },
  NG: { lat: 10.0, lon: 8.0 },
  NI: { lat: 13.0, lon: -85.0 },
  NL: { lat: 52.5, lon: 5.8 },
  NO: { lat: 62.0, lon: 10.0 },
  NP: { lat: 28.0, lon: 84.0 },
  NZ: { lat: -41.0, lon: 174.0 },
  OM: { lat: 21.0, lon: 57.0 },
  PA: { lat: 8.5, lon: -80.0 },
  PE: { lat: -10.0, lon: -76.0 },
  PG: { lat: -6.0, lon: 147.0 },
  PH: { lat: 13.0, lon: 122.0 },
  PK: { lat: 30.0, lon: 70.0 },
  PL: { lat: 52.0, lon: 20.0 },
  PR: { lat: 18.2, lon: -66.5 },
  PS: { lat: 31.9, lon: 35.2 },
  PT: { lat: 39.5, lon: -8.0 },
  PY: { lat: -23.3, lon: -58.0 },
  QA: { lat: 25.3, lon: 51.2 },
  RO: { lat: 46.0, lon: 25.0 },
  RS: { lat: 44.0, lon: 21.0 },
  RU: { lat: 61.0, lon: 99.0 },
  RW: { lat: -2.0, lon: 30.0 },
  SA: { lat: 24.0, lon: 45.0 },
  SD: { lat: 15.0, lon: 30.0 },
  SE: { lat: 62.0, lon: 15.0 },
  SG: { lat: 1.35, lon: 103.8 },
  SI: { lat: 46.0, lon: 15.0 },
  SK: { lat: 48.7, lon: 19.5 },
  SL: { lat: 8.5, lon: -11.8 },
  SN: { lat: 14.5, lon: -14.5 },
  SO: { lat: 6.0, lon: 48.0 },
  SR: { lat: 4.0, lon: -56.0 },
  SS: { lat: 7.5, lon: 30.0 },
  SV: { lat: 13.8, lon: -88.9 },
  SY: { lat: 35.0, lon: 38.0 },
  SZ: { lat: -26.5, lon: 31.5 },
  TD: { lat: 15.0, lon: 19.0 },
  TG: { lat: 8.0, lon: 1.2 },
  TH: { lat: 15.0, lon: 101.0 },
  TJ: { lat: 39.0, lon: 71.0 },
  TL: { lat: -8.8, lon: 126.0 },
  TM: { lat: 40.0, lon: 59.0 },
  TN: { lat: 34.0, lon: 9.0 },
  TR: { lat: 39.0, lon: 35.0 },
  TT: { lat: 10.7, lon: -61.2 },
  TW: { lat: 23.7, lon: 121.0 },
  TZ: { lat: -6.0, lon: 35.0 },
  UA: { lat: 49.0, lon: 32.0 },
  UG: { lat: 1.0, lon: 32.0 },
  US: { lat: 39.8, lon: -98.6 },
  UY: { lat: -33.0, lon: -56.0 },
  UZ: { lat: 41.0, lon: 64.0 },
  VE: { lat: 8.0, lon: -66.0 },
  VN: { lat: 16.0, lon: 106.0 },
  YE: { lat: 15.0, lon: 48.0 },
  ZA: { lat: -29.0, lon: 24.0 },
  ZM: { lat: -14.0, lon: 27.8 },
  ZW: { lat: -19.0, lon: 29.0 }
}
</script>

<style scoped>
.analytics-geo-map {
  position: relative;
  min-height: 21rem;
  overflow: hidden;
  border: 1px solid var(--pb-divider);
  border-radius: var(--pb-radius-card-inner);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--pb-selected-bg) 72%, transparent), color-mix(in srgb, var(--pb-surface-subtle) 86%, transparent)),
    var(--pb-surface-subtle);
}

.analytics-geo-map-svg {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 1;
}

.analytics-geo-map-ocean {
  fill: color-mix(in srgb, var(--pb-selected-bg) 65%, var(--pb-surface));
}

.analytics-geo-map-grid {
  fill: none;
  stroke: color-mix(in srgb, var(--pb-divider) 72%, transparent);
  stroke-width: 1;
}

.analytics-geo-map-land {
  fill: color-mix(in srgb, var(--pb-text-muted) 13%, var(--pb-card-bg));
  stroke: color-mix(in srgb, var(--pb-divider) 70%, transparent);
  stroke-width: 1.4;
}

.analytics-geo-map-halo {
  opacity: 0.2;
}

.analytics-geo-map-core {
  stroke: color-mix(in srgb, var(--pb-card-bg) 82%, white);
  stroke-width: 2;
  opacity: 0.9;
}

.analytics-geo-map-legend {
  position: absolute;
  right: 0.75rem;
  bottom: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid color-mix(in srgb, var(--pb-divider) 72%, transparent);
  border-radius: calc(var(--pb-radius-card-inner) + 0.125rem);
  background: color-mix(in srgb, var(--pb-card-bg) 88%, transparent);
  padding: 0.4rem 0.55rem;
  color: var(--pb-text-muted);
  font-size: 0.75rem;
  backdrop-filter: blur(8px);
}

.analytics-geo-map-legend-swatch {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 999px;
}

.analytics-geo-map-legend-swatch-low {
  background: #0d9488;
}

.analytics-geo-map-legend-swatch-mid {
  background: #f59e0b;
}

.analytics-geo-map-legend-swatch-high {
  background: #dc2626;
}

.analytics-geo-map-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1rem;
  color: var(--pb-text-muted);
  font-size: 0.875rem;
  text-align: center;
}
</style>