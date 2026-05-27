<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-teal-700">Posts</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-stone-950">Tags</h1>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load tags" />
    <UAlert v-if="formError" color="error" icon="i-lucide-circle-alert" :title="formError" />

    <UInput v-model="tagSearch" icon="i-lucide-search" placeholder="Search tags" />

    <section class="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div class="mb-3 flex items-center justify-between gap-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-stone-600">Tag Cloud</h2>
        <span class="text-xs text-stone-500">Click a tag to filter, click "Open" for public posts view</span>
      </div>
      <div v-if="filteredTags.length" class="flex flex-wrap gap-2">
        <button
          v-for="tag in filteredTags"
          :key="`cloud-${tag.id}`"
          type="button"
          class="rounded-full bg-stone-100 px-3 py-1 font-medium text-stone-700 transition hover:-translate-y-0.5 hover:bg-teal-50 hover:text-teal-800"
          :style="tagStyle(tag.post_count ?? 0)"
          @click="selectCloudTag(tag)"
        >
          #{{ tag.name }}
          <span class="ml-1 text-stone-400">{{ tag.post_count ?? 0 }}</span>
        </button>
      </div>
      <p v-else class="text-sm text-stone-500">No tags match your search.</p>
      <div v-if="activeCloudTag" class="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-teal-200 bg-teal-50 p-3">
        <span class="text-sm font-medium text-teal-900">Selected: #{{ activeCloudTag.name }}</span>
        <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-x" @click="clearCloudSelection">Clear</UButton>
        <UButton size="xs" icon="i-lucide-external-link" :to="`/tag/${activeCloudTag.slug}`">Open</UButton>
      </div>
    </section>

    <form class="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto]" @submit.prevent="createTag">
      <UInput v-model="newTag.name" placeholder="Name" icon="i-lucide-tag" />
      <UInput v-model="newTag.slug" placeholder="Slug (optional)" icon="i-lucide-link" />
      <UButton type="submit" icon="i-lucide-plus" :loading="creating">Add tag</UButton>
    </form>

    <div class="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div v-if="pending" class="grid gap-3 p-5">
        <USkeleton v-for="index in 4" :key="index" class="h-12" />
      </div>

      <table v-else-if="filteredTags.length" class="w-full border-collapse text-left text-sm">
        <thead class="bg-stone-50 text-xs uppercase tracking-wider text-stone-500">
          <tr>
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-4 py-3 font-medium">Slug</th>
            <th class="px-4 py-3 font-medium">Posts</th>
            <th class="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-stone-100">
          <tr v-for="tag in filteredTags" :key="tag.id" class="hover:bg-stone-50">
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
                <UButton icon="i-lucide-trash-2" variant="ghost" color="error" :loading="deletingId === tag.id" @click="requestDeleteTag(tag)">Delete</UButton>
              </td>
            </template>
          </tr>
        </tbody>
      </table>

      <UEmpty v-else icon="i-lucide-tags" title="No tags yet" description="Create tags to connect related posts." class="py-12" />
    </div>

    <AdminConfirmActionDialog
      :open="deleteDialogOpen"
      title="Delete tag?"
      :description="deleteDialogDescription"
      confirm-label="Delete"
      confirm-color="error"
      :loading="Boolean(deletingId)"
      @update:open="(value) => { if (!value) closeDeleteDialog() }"
      @cancel="closeDeleteDialog"
      @confirm="confirmDeleteTag"
    />
  </section>
</template>

<script setup lang="ts">
import type { TagRecord } from '~/types/content'

definePageMeta({ layout: 'admin' })

const { data, pending, error, refresh } = await useAsyncData('admin-tags', () => $fetch<{ tags: TagRecord[] }>('/api/admin/tags'))
const tags = computed(() => data.value?.tags ?? [])
const tagSearch = ref('')
const selectedCloudTagSlug = ref('')
const maxPostCount = computed(() => Math.max(1, ...tags.value.map((tag) => tag.post_count ?? 0)))
const filteredTags = computed(() => {
  const query = tagSearch.value.trim().toLowerCase()
  return tags.value.filter((tag) => !query || tag.name.toLowerCase().includes(query))
})
const activeCloudTag = computed(() => tags.value.find((tag) => tag.slug === selectedCloudTagSlug.value) || null)
const newTag = reactive({ name: '', slug: '' })
const draft = reactive({ name: '', slug: '' })
const editingId = ref('')
const creating = ref(false)
const saving = ref(false)
const deletingId = ref('')
const formError = ref('')
const deleteDialogOpen = ref(false)
const pendingDeleteTag = ref<TagRecord | null>(null)
const deleteDialogDescription = computed(() => pendingDeleteTag.value
  ? `Delete tag "${pendingDeleteTag.value.name}"?`
  : 'Delete this tag?')

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

function requestDeleteTag(tag: TagRecord) {
  pendingDeleteTag.value = tag
  deleteDialogOpen.value = true
}

function closeDeleteDialog() {
  if (deletingId.value) {
    return
  }

  deleteDialogOpen.value = false
  pendingDeleteTag.value = null
}

async function confirmDeleteTag() {
  const tag = pendingDeleteTag.value
  if (!tag) {
    closeDeleteDialog()
    return
  }

  deletingId.value = tag.id
  formError.value = ''
  try {
    await $fetch(`/api/admin/tags/${encodeURIComponent(tag.id)}`, { method: 'DELETE' })
    closeDeleteDialog()
    await refresh()
  } catch (err: any) {
    formError.value = err?.statusMessage ?? err?.message ?? 'Could not delete tag'
  } finally {
    deletingId.value = ''
  }
}

function selectCloudTag(tag: TagRecord) {
  selectedCloudTagSlug.value = tag.slug
  tagSearch.value = tag.name
}

function clearCloudSelection() {
  selectedCloudTagSlug.value = ''
}

function tagStyle(count: number) {
  const weight = Math.max(0, Math.min(1, count / maxPostCount.value))
  return {
    fontSize: `${0.76 + weight * 0.34}rem`,
    lineHeight: '1.1'
  }
}
</script>
