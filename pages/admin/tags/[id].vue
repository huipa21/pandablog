<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.taxonomy.tagTitle') }}</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ tag ? `#${tag.name}` : t('admin.taxonomy.tagTitle') }}</h1>
      </div>
      <UButton to="/admin/tags" variant="ghost" color="neutral" icon="i-lucide-arrow-left">
        {{ t('admin.taxonomy.backToTags') }}
      </UButton>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :title="t('admin.taxonomy.loadTagFailed')" />

    <div v-if="pending" class="grid gap-3 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
      <USkeleton class="h-8 w-48" />
      <USkeleton class="h-16" />
    </div>

    <template v-else-if="tag">
      <section class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 class="text-xl font-semibold tracking-normal text-[var(--pb-text)]">#{{ tag.name }}</h2>
          </div>
          <UButton :to="`/tag/${tag.slug}`" size="sm" variant="soft" icon="i-lucide-external-link">
            {{ t('admin.taxonomy.publicView') }}
          </UButton>
        </div>
        <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt class="text-xs font-semibold uppercase tracking-wide text-[var(--pb-text-subtle)]">{{ t('admin.taxonomy.slug') }}</dt>
            <dd class="mt-1 text-[var(--pb-text-muted)]">/{{ tag.slug }}</dd>
          </div>
          <div>
            <dt class="text-xs font-semibold uppercase tracking-wide text-[var(--pb-text-subtle)]">{{ t('admin.taxonomy.posts') }}</dt>
            <dd class="mt-1 text-[var(--pb-text-muted)]">{{ tag.post_count ?? 0 }}</dd>
          </div>
          <div>
            <dt class="text-xs font-semibold uppercase tracking-wide text-[var(--pb-text-subtle)]">{{ t('admin.taxonomy.media') }}</dt>
            <dd class="mt-1 text-[var(--pb-text-muted)]">{{ tag.media_count ?? 0 }}</dd>
          </div>
        </dl>
      </section>

      <AdminTaxonomyPostsList :tag-ids="[tag.id]" />
    </template>

    <UEmpty v-else icon="i-lucide-tags" :title="t('admin.taxonomy.tagNotFound')" :description="t('admin.taxonomy.tagNotFoundDescription')" class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] py-12 shadow-[var(--pb-shadow-sm)]" />
  </section>
</template>

<script setup lang="ts">
import type { TagRecord } from '~/types/content'

definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const route = useRoute()
const tagId = computed(() => routeParam(route.params.id))
const { data, pending, error } = await useAsyncData(
  () => `admin-tag-detail:${tagId.value}`,
  () => $fetch<{ tags: TagRecord[] }>('/api/admin/tags'),
  { watch: [tagId] }
)
const tags = computed(() => data.value?.tags ?? [])
const tag = computed(() => tags.value.find((item) => item.id === tagId.value) ?? null)

function routeParam(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value
  const text = String(raw ?? '')

  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

useHead({ title: () => tag.value ? t('admin.taxonomy.tagHead', { name: tag.value.name }) : t('admin.taxonomy.tagTitle') })
</script>