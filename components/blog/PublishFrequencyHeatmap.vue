<template>
  <section
    class="publish-heatmap rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)] md:p-6"
  >
    <header class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Publish activity</p>
        <h2 class="mt-1 font-[var(--pb-font-display)] text-xl font-semibold tracking-normal text-[var(--pb-text)] md:text-2xl">
          Last 12 months
        </h2>
      </div>
      <p v-if="!pending && !error" class="text-sm text-[var(--pb-text-subtle)]">
        {{ totalPosts }} post<span v-if="totalPosts !== 1">s</span> published
      </p>
    </header>

    <div v-if="pending">
      <USkeleton class="h-32 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      icon="i-lucide-circle-alert"
      title="Could not load publish activity"
    />

    <div v-else class="publish-heatmap-scroll overflow-x-auto">
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
            :style="cell.placeholder ? cellPlaceholderStyle : { backgroundColor: cellColor(cell.level) }"
            :title="cell.placeholder ? undefined : cell.tooltip"
            :aria-label="cell.placeholder ? undefined : cell.tooltip"
          />
        </div>
      </div>

      <div class="publish-heatmap-legend">
        <span>Less</span>
        <span
          v-for="level in 5"
          :key="level"
          class="publish-heatmap-cell"
          :style="{ backgroundColor: cellColor(level - 1) }"
        />
        <span>More</span>
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
  range: {
    start: string
    end: string
    weeks: number
  }
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

const fetchWithSession: PublicFetch = (url) => {
  if (import.meta.server) {
    const requestFetch = useRequestFetch() as unknown as PublicFetch
    return requestFetch(url)
  }
  const clientFetch = $fetch as unknown as PublicFetch
  return clientFetch(url)
}

const { data, pending, error } = await useAsyncData('public-publish-frequency', () =>
  fetchWithSession<PublishFrequencyResponse>('/api/posts/publish-frequency')
)

const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const weekdayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekdayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', '']

const cellPlaceholderStyle = { backgroundColor: 'transparent', visibility: 'hidden' as const }

const weeks = computed(() => data.value?.range.weeks ?? 53)
const totalPosts = computed(() => data.value?.posts.length ?? 0)

const buckets = computed(() => {
  const map = new Map<string, number>()
  for (const post of data.value?.posts ?? []) {
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
  const today = startOfDay(new Date())
  const endOfCurrentWeek = new Date(today.getTime() + (6 - today.getDay()) * MS_PER_DAY)
  const startDate = new Date(endOfCurrentWeek.getTime() - (totalDays - 1) * MS_PER_DAY)

  const result: HeatmapCell[] = []
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(startDate.getTime() + i * MS_PER_DAY)
    const placeholder = date.getTime() > today.getTime()
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
  const labels: MonthLabel[] = []
  let lastMonth = -1
  for (let week = 0; week < weeks.value; week++) {
    const cell = cells.value[week * 7]
    if (!cell) continue
    const month = cell.date.getMonth()
    if (month !== lastMonth) {
      labels.push({ label: monthShort[month] ?? '', column: week + 1 })
      lastMonth = month
    }
  }
  // Drop the very first label if it sits in column 1 with only 1-2 weeks of room
  // (the next month's label would visually clash with it).
  const first = labels[0]
  const second = labels[1]
  if (first && second && first.column === 1 && second.column <= 3) {
    labels.shift()
  }
  return labels
})

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

function levelFor(count: number) {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count <= 4) return 3
  return 4
}

function tooltipFor(date: Date, count: number) {
  const weekday = weekdayShort[date.getDay()]
  const month = monthShort[date.getMonth()]
  const day = date.getDate()
  const year = date.getFullYear()
  const label = count === 0 ? 'No posts' : `${count} post${count === 1 ? '' : 's'}`
  return `${label} on ${weekday} ${month} ${day}, ${year}`
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
}

.publish-heatmap-frame {
  display: grid;
  grid-template-areas:
    ".        months"
    "weekdays cells";
  grid-template-columns: auto 1fr;
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
