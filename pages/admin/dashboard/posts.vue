<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.postsDashboard.eyebrow') }}</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('admin.postsDashboard.title') }}</h1>
        <p class="mt-2 max-w-2xl text-sm text-[var(--pb-text-muted)]">{{ t('admin.postsDashboard.description') }}</p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton to="/admin/posts" icon="i-lucide-list" variant="soft" color="primary">
          {{ t('admin.postsDashboard.openPosts') }}
        </UButton>
        <UButton icon="i-lucide-refresh-cw" variant="ghost" :loading="pending" @click="refreshDashboard">
          {{ t('admin.postsDashboard.refresh') }}
        </UButton>
      </div>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :title="t('admin.postsDashboard.loadFailed')" />

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <template v-if="pending">
        <div v-for="index in 5" :key="index" class="pb-admin-surface p-5">
          <USkeleton class="h-20" />
        </div>
      </template>
      <template v-else>
        <div v-for="card in scorecards" :key="card.label" class="pb-admin-surface p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm text-[var(--pb-text-muted)]">{{ card.label }}</p>
              <p class="mt-2 text-3xl font-semibold text-[var(--pb-text)]">{{ card.value }}</p>
            </div>
            <UIcon :name="card.icon" class="size-5 text-[var(--pb-primary)]" />
          </div>
          <p v-if="card.hint" class="mt-3 text-xs text-[var(--pb-text-muted)]">{{ card.hint }}</p>
        </div>
      </template>
    </div>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
      <section class="pb-admin-surface p-5">
        <div class="mb-4 flex flex-col gap-1">
          <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.postsDashboard.lengthDistribution') }}</h2>
          <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.postsDashboard.lengthDistributionDescription') }}</p>
        </div>

        <div v-if="pending" class="grid gap-3">
          <USkeleton v-for="index in 5" :key="index" class="h-10" />
        </div>
        <div v-else-if="summary.total_posts" class="grid gap-3">
          <div v-for="bucket in lengthBuckets" :key="bucket.key" class="grid gap-2">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="font-medium text-[var(--pb-text)]">{{ bucket.label }}</span>
              <span class="text-[var(--pb-text-muted)]">{{ t('admin.postsDashboard.postsCount', { count: formatNumber(bucket.posts) }) }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-[var(--pb-selected-bg)]">
              <div class="h-full rounded-full bg-[var(--pb-primary)]" :style="{ width: barWidth(bucket.percent, bucket.posts) }" />
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.postsDashboard.empty') }}</p>
      </section>

      <section class="pb-admin-surface p-5">
        <div class="mb-4 flex flex-col gap-1">
          <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.postsDashboard.extremes') }}</h2>
          <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.postsDashboard.extremesDescription') }}</p>
        </div>

        <div v-if="pending" class="grid gap-3">
          <USkeleton v-for="index in 2" :key="index" class="h-24" />
        </div>
        <div v-else-if="dashboard?.extremes.shortest || dashboard?.extremes.longest" class="grid gap-3">
          <NuxtLink v-if="dashboard?.extremes.shortest" :to="postEditorPath(dashboard.extremes.shortest)" class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3 transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)]">
            <p class="text-xs font-medium uppercase tracking-wider text-[var(--pb-text-subtle)]">{{ t('admin.postsDashboard.shortestPost') }}</p>
            <p class="mt-1 truncate text-sm font-semibold text-[var(--pb-text)]">{{ dashboard.extremes.shortest.title || t('admin.common.untitled') }}</p>
            <p class="mt-2 text-sm text-[var(--pb-text-muted)]">{{ formatNumber(dashboard.extremes.shortest.content_units) }} {{ t('admin.postsDashboard.contentUnits') }}</p>
          </NuxtLink>
          <NuxtLink v-if="dashboard?.extremes.longest" :to="postEditorPath(dashboard.extremes.longest)" class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3 transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)]">
            <p class="text-xs font-medium uppercase tracking-wider text-[var(--pb-text-subtle)]">{{ t('admin.postsDashboard.longestPost') }}</p>
            <p class="mt-1 truncate text-sm font-semibold text-[var(--pb-text)]">{{ dashboard.extremes.longest.title || t('admin.common.untitled') }}</p>
            <p class="mt-2 text-sm text-[var(--pb-text-muted)]">{{ formatNumber(dashboard.extremes.longest.content_units) }} {{ t('admin.postsDashboard.contentUnits') }}</p>
          </NuxtLink>
        </div>
        <p v-else class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.postsDashboard.empty') }}</p>
      </section>
    </div>

    <div class="grid gap-5 xl:grid-cols-2">
      <section class="pb-admin-surface p-5">
        <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.postsDashboard.categories') }}</h2>
            <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.postsDashboard.categoriesDescription') }}</p>
          </div>
          <UBadge color="primary" variant="soft">{{ formatNumber(summary.total_categories) }}</UBadge>
        </div>

        <div v-if="pending" class="grid gap-3">
          <USkeleton v-for="index in 5" :key="index" class="h-12" />
        </div>
        <div v-else-if="activeCategories.length" class="grid gap-4">
          <div v-for="category in activeCategories" :key="category.id" class="grid gap-2">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="truncate font-medium text-[var(--pb-text)]">{{ category.name }}</span>
              <span class="shrink-0 text-[var(--pb-text-muted)]">{{ formatNumber(category.content_units) }} {{ t('admin.postsDashboard.unitsShort') }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-[var(--pb-selected-bg)]">
              <div class="h-full rounded-full bg-[var(--pb-primary)]" :style="{ width: barWidth(category.content_unit_percent, category.content_units) }" />
            </div>
            <p class="text-xs text-[var(--pb-text-muted)]">
              {{ t('admin.postsDashboard.categoryLine', { posts: formatNumber(category.posts), words: formatNumber(category.words), cjk: formatNumber(category.cjk_chars) }) }}
            </p>
          </div>
        </div>
        <p v-else class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.postsDashboard.noCategories') }}</p>
      </section>

      <section class="pb-admin-surface p-5">
        <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.postsDashboard.tags') }}</h2>
            <p class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.postsDashboard.tagsDescription') }}</p>
          </div>
          <UBadge color="primary" variant="soft">{{ formatNumber(summary.total_tags) }}</UBadge>
        </div>

        <div v-if="pending" class="grid gap-3">
          <USkeleton v-for="index in 5" :key="index" class="h-10" />
        </div>
        <div v-else-if="activeTags.length" class="grid gap-3">
          <div v-for="tag in activeTags" :key="tag.id" class="grid gap-2">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="truncate font-medium text-[var(--pb-text)]">{{ tag.name }}</span>
              <span class="text-[var(--pb-text-muted)]">{{ t('admin.postsDashboard.postsCount', { count: formatNumber(tag.posts) }) }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-[var(--pb-selected-bg)]">
              <div class="h-full rounded-full bg-[var(--pb-primary)]" :style="{ width: barWidth(tag.post_percent, tag.posts) }" />
            </div>
          </div>

          <div class="mt-2 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-sm font-semibold text-[var(--pb-text)]">{{ t('admin.postsDashboard.singleUseTags') }}</h3>
              <UBadge color="neutral" variant="subtle">{{ formatNumber(singleUseTags.length) }}</UBadge>
            </div>
            <div v-if="singleUseTags.length" class="mt-3 flex flex-wrap gap-2">
              <UBadge v-for="tag in singleUseTags" :key="tag.id" color="neutral" variant="soft">{{ tag.name }}</UBadge>
            </div>
            <p v-else class="mt-3 text-sm text-[var(--pb-text-muted)]">{{ t('admin.postsDashboard.noSingleUseTags') }}</p>
          </div>
        </div>
        <p v-else class="text-sm text-[var(--pb-text-muted)]">{{ t('admin.postsDashboard.noTags') }}</p>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

interface DashboardPostItem {
  id: string
  title: string
  slug: string
  word_count: number
  cjk_char_count: number
  content_units: number
}

interface DashboardCategory {
  id: string
  name: string
  slug: string
  posts: number
  words: number
  cjk_chars: number
  content_units: number
  average_words: number
  average_content_units: number
  post_percent: number
  content_unit_percent: number
}

interface DashboardTag {
  id: string
  name: string
  slug: string
  posts: number
  post_percent: number
  single_use: boolean
}

interface LengthBucket {
  key: string
  min: number
  max: number | null
  label: string
  posts: number
  percent: number
}

interface PostsDashboardResponse {
  summary: {
    total_posts: number
    total_words: number
    average_words: number
    total_cjk_chars: number
    average_cjk_chars: number
    total_content_units: number
    average_content_units: number
    total_categories: number
    used_categories: number
    total_tags: number
    used_tags: number
    single_use_tags: number
  }
  extremes: {
    shortest: DashboardPostItem | null
    longest: DashboardPostItem | null
  }
  categories: DashboardCategory[]
  tags: DashboardTag[]
  single_use_tags: DashboardTag[]
  length_buckets: LengthBucket[]
}

const { t, locale } = useI18n()
const sessionFetch = useSessionFetch()
const { data: dashboard, pending, error, refresh } = await useAsyncData(
  'admin-dashboard-posts',
  () => sessionFetch<PostsDashboardResponse>('/api/admin/dashboard/posts')
)
const numberFormatter = computed(() => new Intl.NumberFormat(locale.value))
const summary = computed(() => dashboard.value?.summary ?? emptySummary())
const lengthBuckets = computed(() => dashboard.value?.length_buckets ?? [])
const activeCategories = computed(() => (dashboard.value?.categories ?? []).filter(category => category.posts > 0))
const activeTags = computed(() => (dashboard.value?.tags ?? []).filter(tag => tag.posts > 0))
const singleUseTags = computed(() => dashboard.value?.single_use_tags ?? [])
const scorecards = computed(() => [
  {
    label: t('admin.postsDashboard.totalPosts'),
    value: formatNumber(summary.value.total_posts),
    icon: 'i-lucide-file-text',
    hint: t('admin.postsDashboard.publishedOnly')
  },
  {
    label: t('admin.postsDashboard.totalWords'),
    value: formatNumber(summary.value.total_words),
    icon: 'i-lucide-align-left',
    hint: t('admin.postsDashboard.averageWords', { count: formatNumber(summary.value.average_words) })
  },
  {
    label: t('admin.postsDashboard.cjkChars'),
    value: formatNumber(summary.value.total_cjk_chars),
    icon: 'i-lucide-languages',
    hint: t('admin.postsDashboard.averageCjkChars', { count: formatNumber(summary.value.average_cjk_chars) })
  },
  {
    label: t('admin.postsDashboard.contentUnits'),
    value: formatNumber(summary.value.total_content_units),
    icon: 'i-lucide-ruler',
    hint: t('admin.postsDashboard.averageUnits', { count: formatNumber(summary.value.average_content_units) })
  },
  {
    label: t('admin.postsDashboard.taxonomy'),
    value: `${formatNumber(summary.value.used_categories)} / ${formatNumber(summary.value.used_tags)}`,
    icon: 'i-lucide-tags',
    hint: t('admin.postsDashboard.taxonomyHint', { categories: formatNumber(summary.value.total_categories), tags: formatNumber(summary.value.total_tags) })
  }
])

function emptySummary(): PostsDashboardResponse['summary'] {
  return {
    total_posts: 0,
    total_words: 0,
    average_words: 0,
    total_cjk_chars: 0,
    average_cjk_chars: 0,
    total_content_units: 0,
    average_content_units: 0,
    total_categories: 0,
    used_categories: 0,
    total_tags: 0,
    used_tags: 0,
    single_use_tags: 0
  }
}

function formatNumber(value: number) {
  return numberFormatter.value.format(value)
}

function barWidth(percent: number, value: number) {
  if (value <= 0) return '0%'
  return `${Math.max(4, percent)}%`
}

function postEditorPath(post: DashboardPostItem) {
  return `/admin/posts/${encodeURIComponent(post.id)}`
}

async function refreshDashboard() {
  await refresh()
}
</script>