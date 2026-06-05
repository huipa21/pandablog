<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Category</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ category?.name || 'Category' }}</h1>
      </div>
      <UButton to="/admin/categories" variant="ghost" color="neutral" icon="i-lucide-arrow-left">
        Back to Categories
      </UButton>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load category" />

    <div v-if="pending" class="grid gap-3 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]">
      <USkeleton class="h-8 w-48" />
      <USkeleton class="h-16" />
    </div>

    <template v-else-if="category">
      <section class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-xl font-semibold tracking-normal text-[var(--pb-text)]">{{ category.name }}</h2>
              <UBadge v-if="isDefaultCategory(category)" color="neutral" variant="subtle">Default</UBadge>
              <UBadge v-else color="primary" variant="subtle">Level {{ categoryLevel(category.id) + 1 }}</UBadge>
            </div>
            <p class="mt-2 max-w-3xl text-sm text-[var(--pb-text-muted)]">{{ category.description || 'No description' }}</p>
          </div>
          <UButton :to="`/category/${category.slug}`" size="sm" variant="soft" icon="i-lucide-external-link">
            Public view
          </UButton>
        </div>
        <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt class="text-xs font-semibold uppercase tracking-wide text-[var(--pb-text-subtle)]">Slug</dt>
            <dd class="mt-1 text-[var(--pb-text-muted)]">/{{ category.slug }}</dd>
          </div>
          <div>
            <dt class="text-xs font-semibold uppercase tracking-wide text-[var(--pb-text-subtle)]">Parent</dt>
            <dd class="mt-1 text-[var(--pb-text-muted)]">{{ parentName(category) }}</dd>
          </div>
          <div>
            <dt class="text-xs font-semibold uppercase tracking-wide text-[var(--pb-text-subtle)]">Posts</dt>
            <dd class="mt-1 text-[var(--pb-text-muted)]">{{ category.post_count ?? 0 }}</dd>
          </div>
        </dl>
      </section>

      <AdminTaxonomyPostsList :category-ids="[category.id]" />
    </template>

    <UEmpty v-else icon="i-lucide-folder-x" title="Category not found" description="Return to categories to choose another item." class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] py-12 shadow-[var(--pb-shadow-sm)]" />
  </section>
</template>

<script setup lang="ts">
import type { CategoryRecord } from '~/types/content'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const categoryId = computed(() => routeParam(route.params.id))
const { data, pending, error } = await useAsyncData(
  () => `admin-category-detail:${categoryId.value}`,
  () => $fetch<{ categories: CategoryRecord[] }>('/api/admin/categories'),
  { watch: [categoryId] }
)
const categories = computed(() => data.value?.categories ?? [])
const category = computed(() => categories.value.find((item) => item.id === categoryId.value) ?? null)

function routeParam(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value
  const text = String(raw ?? '')

  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

function parentName(item: CategoryRecord) {
  if (isDefaultCategory(item)) {
    return 'On its own'
  }

  const parent = item.parent_id ? categories.value.find((categoryItem) => categoryItem.id === item.parent_id) : null
  return parent?.name ?? 'None'
}

function categoryLevel(categoryRecordId: string, seen = new Set<string>()): number {
  if (seen.has(categoryRecordId)) {
    return 0
  }

  seen.add(categoryRecordId)
  const current = categories.value.find((item) => item.id === categoryRecordId)
  const parent = current?.parent_id ? categories.value.find((item) => item.id === current.parent_id) : null

  if (!parent || isDefaultCategory(parent)) {
    return 0
  }

  return categoryLevel(parent.id, seen) + 1
}

function isDefaultCategory(item: CategoryRecord) {
  return item.slug === 'default'
}

useHead({ title: () => category.value ? `Category: ${category.value.name}` : 'Category' })
</script>