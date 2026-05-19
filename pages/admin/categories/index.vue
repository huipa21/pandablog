<template>
  <section class="grid gap-6">
    <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-teal-700">Posts</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-normal text-stone-950">Categories</h1>
      </div>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load categories" />
    <UAlert v-if="formError" color="error" icon="i-lucide-circle-alert" :title="formError" />

    <form class="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_1.5fr_auto]" @submit.prevent="createCategory">
      <UInput v-model="newCategory.name" placeholder="Name" icon="i-lucide-folder" />
      <UInput v-model="newCategory.slug" placeholder="Slug (optional)" icon="i-lucide-link" />
      <UInput v-model="newCategory.description" placeholder="Description" icon="i-lucide-text" />
      <UButton type="submit" icon="i-lucide-plus" :loading="creating">Add category</UButton>
    </form>

    <div class="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div v-if="pending" class="grid gap-3 p-5">
        <USkeleton v-for="index in 4" :key="index" class="h-12" />
      </div>

      <table v-else-if="categories.length" class="w-full border-collapse text-left text-sm">
        <thead class="bg-stone-50 text-xs uppercase tracking-wider text-stone-500">
          <tr>
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-4 py-3 font-medium">Slug</th>
            <th class="px-4 py-3 font-medium">Description</th>
            <th class="px-4 py-3 font-medium">Posts</th>
            <th class="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-stone-100">
          <tr v-for="category in categories" :key="category.id" class="hover:bg-stone-50">
            <template v-if="editingId === category.id">
              <td class="px-4 py-3"><UInput v-model="draft.name" size="sm" /></td>
              <td class="px-4 py-3"><UInput v-model="draft.slug" size="sm" /></td>
              <td class="px-4 py-3"><UInput v-model="draft.description" size="sm" /></td>
              <td class="px-4 py-3 text-stone-600">{{ category.post_count ?? 0 }}</td>
              <td class="px-4 py-3 text-right">
                <UButton icon="i-lucide-check" variant="ghost" color="primary" :loading="saving" @click="saveCategory(category.id)">Save</UButton>
                <UButton icon="i-lucide-x" variant="ghost" color="neutral" @click="cancelEdit">Cancel</UButton>
              </td>
            </template>
            <template v-else>
              <td class="px-4 py-3 font-medium text-stone-950">{{ category.name }}</td>
              <td class="px-4 py-3 text-stone-600">/{{ category.slug }}</td>
              <td class="px-4 py-3 text-stone-600">{{ category.description || '—' }}</td>
              <td class="px-4 py-3 text-stone-600">{{ category.post_count ?? 0 }}</td>
              <td class="px-4 py-3 text-right">
                <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" @click="startEdit(category)">Edit</UButton>
                <UButton icon="i-lucide-trash-2" variant="ghost" color="error" :loading="deletingId === category.id" @click="deleteCategory(category)">Delete</UButton>
              </td>
            </template>
          </tr>
        </tbody>
      </table>

      <UEmpty v-else icon="i-lucide-folder" title="No categories yet" description="Create categories to organize your posts." class="py-12" />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { CategoryRecord } from '~/types/content'

definePageMeta({ layout: 'admin' })

const { data, pending, error, refresh } = await useAsyncData('admin-categories', () => $fetch<{ categories: CategoryRecord[] }>('/api/admin/categories'))
const categories = computed(() => data.value?.categories ?? [])
const newCategory = reactive({ name: '', slug: '', description: '' })
const draft = reactive({ name: '', slug: '', description: '' })
const editingId = ref('')
const creating = ref(false)
const saving = ref(false)
const deletingId = ref('')
const formError = ref('')

async function createCategory() {
  creating.value = true
  formError.value = ''
  try {
    await $fetch('/api/admin/categories', {
      method: 'POST',
      body: { ...newCategory }
    })
    newCategory.name = ''
    newCategory.slug = ''
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
      body: { ...draft }
    })
    editingId.value = ''
    await refresh()
  } catch (err: any) {
    formError.value = err?.statusMessage ?? err?.message ?? 'Could not save category'
  } finally {
    saving.value = false
  }
}

async function deleteCategory(category: CategoryRecord) {
  if (!confirm(`Delete category "${category.name}"?`)) {
    return
  }

  deletingId.value = category.id
  formError.value = ''
  try {
    await $fetch(`/api/admin/categories/${encodeURIComponent(category.id)}`, { method: 'DELETE' })
    await refresh()
  } catch (err: any) {
    formError.value = err?.statusMessage ?? err?.message ?? 'Could not delete category'
  } finally {
    deletingId.value = ''
  }
}
</script>
