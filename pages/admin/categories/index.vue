<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Posts</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">Categories</h1>
      </div>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load categories" />
    <UAlert v-if="formError" color="error" icon="i-lucide-circle-alert" :title="formError" />

    <form class="grid gap-3 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)] md:grid-cols-[1fr_1fr_1fr_1.5fr_auto]" @submit.prevent="createCategory">
      <UInput v-model="newCategory.name" placeholder="Name" icon="i-lucide-folder" />
      <UInput v-model="newCategory.slug" placeholder="Slug (optional)" icon="i-lucide-link" />
      <USelect v-model="newCategory.parent_id" :items="parentOptionsFor()" icon="i-lucide-folder-tree" />
      <UInput v-model="newCategory.description" placeholder="Description" icon="i-lucide-text" />
      <UButton type="submit" icon="i-lucide-plus" :loading="creating">Add category</UButton>
    </form>

    <div class="overflow-hidden rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] shadow-[var(--pb-shadow-sm)]">
      <div v-if="pending" class="grid gap-3 p-5">
        <USkeleton v-for="index in 4" :key="index" class="h-12" />
      </div>

      <table v-else-if="categories.length" class="w-full border-collapse text-left text-sm">
        <thead class="bg-[var(--pb-surface-subtle)] text-xs uppercase tracking-wider text-[var(--pb-text-subtle)]">
          <tr>
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-4 py-3 font-medium">Parent</th>
            <th class="px-4 py-3 font-medium">Slug</th>
            <th class="px-4 py-3 font-medium">Description</th>
            <th class="px-4 py-3 font-medium">Posts</th>
            <th class="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--pb-divider)]">
          <tr v-for="row in visibleCategoryRows" :key="row.category.id" class="hover:bg-[var(--pb-card-bg-hover)]">
            <template v-if="editingId === row.category.id">
              <td class="px-4 py-3"><UInput v-model="draft.name" size="sm" /></td>
              <td class="px-4 py-3">
                <USelect v-model="draft.parent_id" :items="parentOptionsFor(row.category)" size="sm" :disabled="isDefaultCategory(row.category)" />
              </td>
              <td class="px-4 py-3"><UInput v-model="draft.slug" size="sm" /></td>
              <td class="px-4 py-3"><UInput v-model="draft.description" size="sm" /></td>
              <td class="px-4 py-3 text-[var(--pb-text-muted)]">{{ row.category.post_count ?? 0 }}</td>
              <td class="px-4 py-3 text-right">
                <UButton icon="i-lucide-check" variant="ghost" color="primary" :loading="saving" @click="saveCategory(row.category.id)">Save</UButton>
                <UButton icon="i-lucide-x" variant="ghost" color="neutral" @click="cancelEdit">Cancel</UButton>
              </td>
            </template>
            <template v-else>
              <td class="px-4 py-3 font-medium text-[var(--pb-text)]">
                <div class="flex items-center gap-2" :style="{ paddingLeft: `${row.level * 1.25}rem` }">
                  <UButton
                    v-if="row.hasChildren"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    :icon="row.collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
                    :aria-label="row.collapsed ? 'Expand category' : 'Collapse category'"
                    @click.stop="toggleCollapse(row.category.id)"
                  />
                  <span v-else class="w-7" />
                  <NuxtLink :to="`/admin/categories/${encodeURIComponent(row.category.id)}`" class="hover:text-[var(--pb-link-hover)]">
                    {{ row.category.name }}
                  </NuxtLink>
                  <UBadge v-if="isDefaultCategory(row.category)" color="neutral" variant="subtle">Default</UBadge>
                  <UBadge v-else color="primary" variant="subtle">Level {{ row.level + 1 }}</UBadge>
                </div>
              </td>
              <td class="px-4 py-3 text-[var(--pb-text-muted)]">{{ parentName(row.category) }}</td>
              <td class="px-4 py-3 text-[var(--pb-text-muted)]">/{{ row.category.slug }}</td>
              <td class="px-4 py-3 text-[var(--pb-text-muted)]">{{ row.category.description || '-' }}</td>
              <td class="px-4 py-3 text-[var(--pb-text-muted)]">{{ row.category.post_count ?? 0 }}</td>
              <td class="px-4 py-3 text-right">
                <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" @click="startEdit(row.category)">Edit</UButton>
                <UButton icon="i-lucide-trash-2" variant="ghost" color="error" :loading="deletingId === row.category.id" :disabled="isDefaultCategory(row.category)" @click="requestDeleteCategory(row.category)">Delete</UButton>
              </td>
            </template>
          </tr>
        </tbody>
      </table>

      <UEmpty v-else icon="i-lucide-folder" title="No categories yet" description="Create categories to organize your posts." class="py-12" />
    </div>

    <AdminConfirmActionDialog
      :open="deleteDialogOpen"
      title="Delete category?"
      :description="deleteDialogDescription"
      confirm-label="Delete"
      confirm-color="error"
      :loading="Boolean(deletingId)"
      @update:open="(value) => { if (!value) closeDeleteDialog() }"
      @cancel="closeDeleteDialog"
      @confirm="confirmDeleteCategory"
    />
  </section>
</template>

<script setup lang="ts">
import type { CategoryRecord } from '~/types/content'

definePageMeta({ layout: 'admin' })

const { data, pending, error, refresh } = await useAsyncData('admin-categories', () => $fetch<{ categories: CategoryRecord[] }>('/api/admin/categories'))
const categories = computed(() => data.value?.categories ?? [])
const noParentValue = '__none__'
const newCategory = reactive({ name: '', slug: '', parent_id: noParentValue, description: '' })
const draft = reactive({ name: '', slug: '', parent_id: noParentValue, description: '' })
const editingId = ref('')
const creating = ref(false)
const saving = ref(false)
const deletingId = ref('')
const formError = ref('')
const collapsedIds = ref<string[]>([])
const deleteDialogOpen = ref(false)
const pendingDeleteCategory = ref<CategoryRecord | null>(null)
const deleteDialogDescription = computed(() => pendingDeleteCategory.value
  ? `Delete category "${pendingDeleteCategory.value.name}"?`
  : 'Delete this category?')

const visibleCategoryRows = computed(() => {
  const rows: Array<{ category: CategoryRecord, level: number, hasChildren: boolean, collapsed: boolean }> = []
  const collapsed = new Set(collapsedIds.value)

  for (const category of categories.value.filter(isDefaultCategory).sort(byName)) {
    rows.push({ category, level: 0, hasChildren: false, collapsed: false })
  }

  appendRows(null, 0)
  return rows

  function appendRows(parentId: string | null, level: number) {
    for (const category of childCategories(parentId)) {
      const children = childCategories(category.id)
      const isCollapsed = collapsed.has(category.id)
      rows.push({ category, level, hasChildren: children.length > 0, collapsed: isCollapsed })

      if (!isCollapsed) {
        appendRows(category.id, level + 1)
      }
    }
  }
})

async function createCategory() {
  creating.value = true
  formError.value = ''
  try {
    await $fetch('/api/admin/categories', {
      method: 'POST',
      body: { ...newCategory, parent_id: selectedParentId(newCategory.parent_id) }
    })
    newCategory.name = ''
    newCategory.slug = ''
    newCategory.parent_id = noParentValue
    newCategory.description = ''
    await refresh()
  } catch (err: any) {
    formError.value = err?.statusMessage ?? err?.message ?? 'Could not create category'
  } finally {
    creating.value = false
  }
}

function startEdit(category: CategoryRecord) {
  editingId.value = category.id
  draft.name = category.name
  draft.slug = category.slug
  draft.parent_id = isDefaultCategory(category) ? noParentValue : category.parent_id ?? noParentValue
  draft.description = category.description ?? ''
}

function cancelEdit() {
  editingId.value = ''
}

async function saveCategory(id: string) {
  saving.value = true
  formError.value = ''
  try {
    await $fetch(`/api/admin/categories/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: { ...draft, parent_id: selectedParentId(draft.parent_id) }
    })
    editingId.value = ''
    await refresh()
  } catch (err: any) {
    formError.value = err?.statusMessage ?? err?.message ?? 'Could not save category'
  } finally {
    saving.value = false
  }
}

function requestDeleteCategory(category: CategoryRecord) {
  pendingDeleteCategory.value = category
  deleteDialogOpen.value = true
}

function closeDeleteDialog() {
  if (deletingId.value) {
    return
  }

  deleteDialogOpen.value = false
  pendingDeleteCategory.value = null
}

async function confirmDeleteCategory() {
  const category = pendingDeleteCategory.value
  if (!category) {
    closeDeleteDialog()
    return
  }

  deletingId.value = category.id
  formError.value = ''
  try {
    await $fetch(`/api/admin/categories/${encodeURIComponent(category.id)}`, { method: 'DELETE' })
    closeDeleteDialog()
    await refresh()
  } catch (err: any) {
    formError.value = err?.statusMessage ?? err?.message ?? 'Could not delete category'
  } finally {
    deletingId.value = ''
  }
}

function parentOptionsFor(category?: CategoryRecord) {
  return [
    { label: 'No parent', value: noParentValue },
    ...flattenCategoriesForSelect()
      .filter((entry) => canUseAsParent(entry.category, category))
      .map((entry) => ({
        label: `${'-- '.repeat(entry.level)}${entry.category.name}`,
        value: entry.category.id
      }))
  ]
}

function selectedParentId(value: string) {
  return value === noParentValue ? null : value
}

function flattenCategoriesForSelect() {
  const rows: Array<{ category: CategoryRecord, level: number }> = []
  appendRows(null, 0)
  return rows

  function appendRows(parentId: string | null, level: number) {
    for (const category of childCategories(parentId)) {
      rows.push({ category, level })
      appendRows(category.id, level + 1)
    }
  }
}

function childCategories(parentId: string | null) {
  return categories.value
    .filter((category) => !isDefaultCategory(category) && normalizedParentId(category) === parentId)
    .sort(byName)
}

function normalizedParentId(category: CategoryRecord) {
  const categoryMap = new Map(categories.value.map((item) => [item.id, item]))
  const parent = category.parent_id ? categoryMap.get(category.parent_id) : null
  return parent && !isDefaultCategory(parent) ? parent.id : null
}

function parentName(category: CategoryRecord) {
  if (isDefaultCategory(category)) {
    return 'On its own'
  }

  const parentId = normalizedParentId(category)
  if (!parentId) {
    return 'None'
  }

  return categories.value.find((item) => item.id === parentId)?.name ?? 'None'
}

function canUseAsParent(parent: CategoryRecord, category?: CategoryRecord) {
  if (isDefaultCategory(parent)) {
    return false
  }

  if (category) {
    if (parent.id === category.id || isDescendantOf(parent.id, category.id)) {
      return false
    }
  }

  const subtreeDepth = category ? descendantDepth(category.id) : 0
  return categoryLevel(parent.id) + 1 + subtreeDepth <= 2
}

function categoryLevel(categoryId: string, seen = new Set<string>()): number {
  if (seen.has(categoryId)) {
    return 0
  }

  seen.add(categoryId)
  const category = categories.value.find((item) => item.id === categoryId)
  if (!category) {
    return 0
  }

  const parentId = normalizedParentId(category)
  return parentId ? categoryLevel(parentId, seen) + 1 : 0
}

function descendantDepth(categoryId: string, seen = new Set<string>()): number {
  if (seen.has(categoryId)) {
    return 0
  }

  seen.add(categoryId)
  const children = childCategories(categoryId)
  if (!children.length) {
    return 0
  }

  return Math.max(...children.map((child) => descendantDepth(child.id, new Set(seen)) + 1))
}

function isDescendantOf(candidateId: string, ancestorId: string) {
  let current = categories.value.find((category) => category.id === candidateId)
  const seen = new Set<string>()

  while (current && !seen.has(current.id)) {
    const parentId = normalizedParentId(current)
    if (parentId === ancestorId) {
      return true
    }

    seen.add(current.id)
    current = parentId ? categories.value.find((category) => category.id === parentId) : undefined
  }

  return false
}

function isDefaultCategory(category: CategoryRecord) {
  return category.slug === 'default'
}

function toggleCollapse(categoryId: string) {
  collapsedIds.value = collapsedIds.value.includes(categoryId)
    ? collapsedIds.value.filter((id) => id !== categoryId)
    : [...collapsedIds.value, categoryId]
}

function byName(left: CategoryRecord, right: CategoryRecord) {
  return left.name.localeCompare(right.name)
}
</script>