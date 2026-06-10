<template>
  <section
    class="publish-heatmap rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)] md:p-6"
  >
    <header class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('public.heatmap.eyebrow') }}</p>
        <h2 class="mt-1 font-[var(--pb-font-display)] text-xl font-semibold tracking-normal text-[var(--pb-text)] md:text-2xl">
          {{ yearTitle }}
        </h2>
      </div>
      <div class="flex flex-col items-start gap-2 sm:items-end">
        <USelect v-model="selectedYear" :items="yearOptions" size="sm" class="w-32" :aria-label="t('public.heatmap.yearAria')" />
        <p v-if="!pending && !error" class="text-sm text-[var(--pb-text-subtle)]">
          {{ totalPublishedLabel }}
        </p>
      </div>
    </header>

    <div v-if="pending">
      <USkeleton class="h-32 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      icon="i-lucide-circle-alert"
      :title="t('public.heatmap.loadFailed')"
    />

    <div v-else class="publish-heatmap-scroll overflow-x-auto">
      <div class="publish-heatmap-board">
        <div class="publish-heatmap-frame">
          <div
            class="publish-heatmap-months"
            :style="{ gridTemplateColumns: `repeat(${weeks}, var(--cell-size))` }"
          >
            <span
              v-for="label in monthLabels"
              :key="`${label.label}-${label.column}`"
              :style="{ gridColumn: String(label.column) }"
            >
              {{ label.label }}
            </span>
          </div>

          <div class="publish-heatmap-weekdays">
            <span v-for="(label, index) in weekdayLabels" :key="index">{{ label }}</span>
          </div>

          <div class="publish-heatmap-cells">
            <div
              v-for="cell in cells"
              :key="cell.iso"
              class="publish-heatmap-cell"
              :class="{ 'is-placeholder': cell.placeholder }"
              :style="cell.placeholder ? cellPlaceholderStyle : { backgroundColor: cellColor(cell.level) }"
              :title="cell.placeholder ? undefined : cell.tooltip"
              :aria-label="cell.placeholder ? undefined : cell.tooltip"
              :data-tooltip="cell.placeholder ? undefined : cell.tooltip"
            />
          </div>
        </div>

        <div class="publish-heatmap-legend">
          <span>{{ t('public.heatmap.less') }}</span>
          <span
            v-for="level in 5"
            :key="level"
            class="publish-heatmap-cell"
            :style="{ backgroundColor: cellColor(level - 1) }"
          />
          <span>{{ t('public.heatmap.more') }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
interface PublishFrequencyEntry {
  slug: string
  title: string
  published_at: string
}

interface PublishFrequencyResponse {
  posts: PublishFrequencyEntry[]
}

interface HeatmapCell {
  iso: string
  date: Date
  count: number
  level: number
  tooltip: string
  placeholder: boolean
}

interface MonthLabel {
  label: string
  column: number
}

type PublicFetch = <T>(url: string) => Promise<T>

const MS_PER_DAY = 24 * 60 * 60 * 1000
const { t, locale } = useI18n()

const fetchWithSession: PublicFetch = (url) => {
  if (import.meta.server) {
    const requestFetch = useRequestFetch() as unknown as PublicFetch
    return requestFetch(url)
  }
  const clientFetch = $fetch as unknown as PublicFetch
  return clientFetch(url)
}

const currentYear = new Date().getFullYear()
const selectedYear = ref(String(currentYear))

const { data, pending, error } = await useAsyncData('public-publish-frequency', () =>
  fetchWithSession<PublishFrequencyResponse>('/api/posts/publish-frequency')
)

const monthShort = computed(() => Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(locale.value, { month: 'short' }).format(new Date(2024, month, 1))))
const weekdayLabels = computed(() => ['', weekdayLabel(1), '', weekdayLabel(3), '', weekdayLabel(5), ''])

const cellPlaceholderStyle = { backgroundColor: 'transparent', visibility: 'hidden' as const }

const availableYears = computed(() => {
  const years = new Set<number>()
  for (const post of data.value?.posts ?? []) {
    const year = yearFor(post.published_at)
    if (year) years.add(year)
  }
  return [...years].sort((a, b) => b - a)
})

const yearOptions = computed(() => {
  const years = availableYears.value.length ? availableYears.value : [currentYear]
  return years.map((year) => ({ label: String(year), value: String(year) }))
})

watch(yearOptions, (options) => {
  if (!options.some((option) => option.value === selectedYear.value)) {
    selectedYear.value = options[0]?.value ?? String(currentYear)
  }
}, { immediate: true })

const activeYear = computed(() => Number(selectedYear.value) || currentYear)
const yearTitle = computed(() => String(activeYear.value))
const yearPosts = computed(() => (data.value?.posts ?? []).filter((post) => yearFor(post.published_at) === activeYear.value))
const totalPosts = computed(() => yearPosts.value.length)
const totalPublishedLabel = computed(() => t(totalPosts.value === 1 ? 'public.heatmap.publishedOne' : 'public.heatmap.published', { count: totalPosts.value }))

const gridRange = computed(() => {
  const startOfYear = new Date(activeYear.value, 0, 1)
  const endOfYear = new Date(activeYear.value, 11, 31)
  const start = addDays(startOfYear, -startOfYear.getDay())
  const end = addDays(endOfYear, 6 - endOfYear.getDay())
  const days = dayNumber(end) - dayNumber(start) + 1

  return {
    start,
    weeks: Math.ceil(days / 7)
  }
})

const weeks = computed(() => gridRange.value.weeks)

const buckets = computed(() => {
  const map = new Map<string, number>()
  for (const post of yearPosts.value) {
    if (!post.published_at) continue
    const d = new Date(post.published_at)
    if (Number.isNaN(d.getTime())) continue
    const key = isoDay(d)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
})

const cells = computed<HeatmapCell[]>(() => {
  const totalDays = weeks.value * 7
  const startDate = gridRange.value.start

  const result: HeatmapCell[] = []
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(startDate, i)
    const placeholder = date.getFullYear() !== activeYear.value
    const iso = isoDay(date)
    const count = buckets.value.get(iso) ?? 0
    result.push({
      iso,
      date,
      count,
      level: levelFor(count),
      tooltip: placeholder ? '' : tooltipFor(date, count),
      placeholder
    })
  }
  return result
})

const monthLabels = computed<MonthLabel[]>(() => {
  return monthShort.value.map((label, month) => {
    const firstDay = new Date(activeYear.value, month, 1)
    const column = Math.floor((dayNumber(firstDay) - dayNumber(gridRange.value.start)) / 7) + 1
    return { label, column }
  })
})

function yearFor(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.getFullYear()
}

function isoDay(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number) {
  const d = startOfDay(date)
  d.setDate(d.getDate() + days)
  return d
}

function dayNumber(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY
}

function levelFor(count: number) {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count <= 4) return 3
  return 4
}

function tooltipFor(date: Date, count: number) {
  const label = count === 0 ? t('public.heatmap.noPosts') : t(count === 1 ? 'public.heatmap.postsOne' : 'public.heatmap.posts', { count })
  const dateLabel = new Intl.DateTimeFormat(locale.value, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(date)
  return t('public.heatmap.tooltip', { label, date: dateLabel })
}

function weekdayLabel(day: number) {
  return new Intl.DateTimeFormat(locale.value, { weekday: 'short' }).format(new Date(2024, 0, day))
}

function cellColor(level: number) {
  switch (level) {
    case 1: return 'color-mix(in srgb, var(--pb-link) 22%, var(--pb-surface-subtle))'
    case 2: return 'color-mix(in srgb, var(--pb-link) 45%, var(--pb-surface-subtle))'
    case 3: return 'color-mix(in srgb, var(--pb-link) 70%, var(--pb-surface-subtle))'
    case 4: return 'var(--pb-link)'
    default: return 'var(--pb-surface-subtle)'
  }
}
</script>

<style scoped>
.publish-heatmap {
  --cell-size: clamp(0.625rem, 0.85vw, 0.9rem);
  --cell-gap: 3px;
  --cell-radius: 3px;
  --label-color: var(--pb-text-subtle);
}

.publish-heatmap-scroll {
  /* Allow horizontal scroll on narrow viewports without breaking page layout. */
  -webkit-overflow-scrolling: touch;
  padding-top: 1.5rem;
}

.publish-heatmap-board {
  display: inline-flex;
  width: max-content;
  min-width: max-content;
  flex-direction: column;
  align-items: flex-end;
}

.publish-heatmap-frame {
  display: grid;
  grid-template-areas:
    ".        months"
    "weekdays cells";
  grid-template-columns: max-content max-content;
  column-gap: 8px;
  row-gap: 4px;
  width: max-content;
}

.publish-heatmap-months {
  grid-area: months;
  display: grid;
  column-gap: var(--cell-gap);
  align-items: end;
  min-height: 1.1rem;
  font-size: 0.7rem;
  color: var(--label-color);
}

.publish-heatmap-months > span {
  white-space: nowrap;
}

.publish-heatmap-weekdays {
  grid-area: weekdays;
  display: grid;
  grid-template-rows: repeat(7, var(--cell-size));
  row-gap: var(--cell-gap);
  align-items: center;
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--label-color);
  padding-right: 2px;
}

.publish-heatmap-cells {
  grid-area: cells;
  display: grid;
  grid-template-rows: repeat(7, var(--cell-size));
  grid-auto-flow: column;
  grid-auto-columns: var(--cell-size);
  gap: var(--cell-gap);
}

.publish-heatmap-cell {
  width: var(--cell-size);
  height: var(--cell-size);
  border-radius: var(--cell-radius);
  display: inline-block;
}

.publish-heatmap-cell[data-tooltip] {
  position: relative;
  cursor: default;
}

.publish-heatmap-cell[data-tooltip]::after {
  position: absolute;
  bottom: calc(100% + 0.35rem);
  left: 50%;
  z-index: 1;
  width: max-content;
  max-width: 14rem;
  transform: translateX(-50%) translateY(0.15rem);
  border-radius: var(--pb-radius-sm);
  background: var(--pb-text);
  box-shadow: var(--pb-shadow-sm);
  color: var(--pb-card-bg);
  content: attr(data-tooltip);
  font-size: 0.7rem;
  line-height: 1.3;
  opacity: 0;
  padding: 0.35rem 0.5rem;
  pointer-events: none;
  transition: opacity 80ms ease, transform 80ms ease;
  white-space: nowrap;
}

.publish-heatmap-cell[data-tooltip]:hover::after {
  opacity: 1;
  transform: translateX(-50%);
}

.publish-heatmap-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 1rem;
  font-size: 0.7rem;
  color: var(--label-color);
}

.publish-heatmap-legend > span:first-child,
.publish-heatmap-legend > span:last-child {
  margin-inline: 4px;
}
</style>
