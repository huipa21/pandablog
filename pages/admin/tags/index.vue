<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-teal-700">Posts</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-stone-950">Tags</h1>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load tags" />
    <UAlert v-if="formError" color="error" icon="i-lucide-circle-alert" :title="formError" />

    <form class="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto]" @submit.prevent="createTag">
      <UInput v-model="newTag.name" placeholder="Name" icon="i-lucide-tag" />
      <UInput v-model="newTag.slug" placeholder="Slug (optional)" icon="i-lucide-link" />
      <UButton type="submit" icon="i-lucide-plus" :loading="creating">Add tag</UButton>
    </form>

    <div class="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div v-if="pending" class="grid gap-3 p-5">
        <USkeleton v-for="index in 4" :key="index" class="h-12" />
      </div>

      <table v-else-if="tags.length" class="w-full border-collapse text-left text-sm">
        <thead class="bg-stone-50 text-xs uppercase tracking-wider text-stone-500">
          <tr>
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-4 py-3 font-medium">Slug</th>
            <th class="px-4 py-3 font-medium">Posts</th>
            <th class="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-stone-100">
          <tr v-for="tag in tags" :key="tag.id" class="hover:bg-stone-50">
            <template v-if="editingId === tag.id">
              <td class="px-4 py-3"><UInput v-model="draft.name" size="sm" /></td>
              <td class="px-4 py-3"><UInput v-model="draft.slug" size="sm" /></td>
              <td class="px-4 py-3 text-stone-600">{{ tag.post_count ?? 0 }}</td>
              <td class="px-4 py-3 text-right">
                <UButton icon="i-lucide-check" variant="ghost" color="primary" :loading="saving" @click="saveTag(tag.id)">Save</UButton>
                <UButton icon="i-lucide-x" variant="ghost" color="neutral" @click="cancelEdit">Cancel</UButton>
              </td>
            </template>
            <template v-else>
              <td class="px-4 py-3 font-medium text-stone-950">{{ tag.name }}</td>
              <td class="px-4 py-3 text-stone-600">/{{ tag.slug }}</td>
              <td class="px-4 py-3 text-stone-600">{{ tag.post_count ?? 0 }}</td>
              <td class="px-4 py-3 text-right">
                <UButton icon="i-lucide-pencil" variant="ghost" color="neutral" @click="startEdit(tag)">Edit</UButton>
                <UButton icon="i-lucide-trash-2" variant="ghost" color="error" :loading="deletingId === tag.id" @click="deleteTag(tag)">Delete</UButton>
              </td>
            </template>
          </tr>
        </tbody>
      </table>

      <UEmpty v-else icon="i-lucide-tags" title="No tags yet" description="Create tags to connect related posts." class="py-12" />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { TagRecord } from '~/types/content'

definePageMeta({ layout: 'admin' })

const { data, pending, error, refresh } = await useAsyncData('admin-tags', () => $fetch<{ tags: TagRecord[] }>('/api/admin/tags'))
const tags = computed(() => data.value?.tags ?? [])
const newTag = reactive({ name: '', slug: '' })
const draft = reactive({ name: '', slug: '' })
const editingId = ref('')
const creating = ref(false)
const saving = ref(false)
const deletingId = ref('')
const formError = ref('')

async function createTag() {
  creating.value = true
  formError.value = ''
  try {
    await $fetch('/api/admin/tags', {
      method: 'POST',
      body: { ...newTag }
    })
    newTag.name = ''
    newTag.slug = ''
    await refresh()
  } catch (err: any) {
    formError.value = err?.statusMessage ?? err?.message ?? 'Could not create tag'
  } finally {
    creating.value = false
  }
}

function startEdit(tag: TagRecord) {
  editingId.value = tag.id
  draft.name = tag.name
  draft.slug = tag.slug
}

function cancelEdit() {
  editingId.value = ''
}

async function saveTag(id: string) {
  saving.value = true
  formError.value = ''
  try {
    await $fetch(`/api/admin/tags/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: { ...draft }
    })
    editingId.value = ''
    await refresh()
  } catch (err: any) {
    formError.value = err?.statusMessage ?? err?.message ?? 'Could not save tag'
  } finally {
    saving.value = false
  }
}

async function deleteTag(tag: TagRecord) {
  if (!confirm(`Delete tag "${tag.name}"?`)) {
    return
  }

  deletingId.value = tag.id
  formError.value = ''
  try {
    await $fetch(`/api/admin/tags/${encodeURIComponent(tag.id)}`, { method: 'DELETE' })
    await refresh()
  } catch (err: any) {
    formError.value = err?.statusMessage ?? err?.message ?? 'Could not delete tag'
  } finally {
    deletingId.value = ''
  }
}
</script>
