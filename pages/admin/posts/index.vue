<template>
  <section class="grid gap-6">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p class="text-sm font-medium uppercase tracking-wider text-teal-700">Content</p>
        <h1 class="mt-1 text-3xl font-semibold tracking-normal text-stone-950">Posts</h1>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <USelect
          v-model="statusFilter"
          :items="statusFilterOptions"
          size="sm"
          class="w-44"
        />
        <UBadge v-if="selectedIds.length" color="neutral" variant="subtle">{{ selectedIds.length }} selected</UBadge>
        <UDropdownMenu v-if="selectedIds.length" :items="actionsMenuItems">
          <UButton icon="i-lucide-list-checks" color="neutral" variant="soft">
            Actions
          </UButton>
        </UDropdownMenu>
        <UBadge v-if="quickEditEnabled" color="primary" variant="subtle">Quick Edit ON</UBadge>
        <UButton icon="i-lucide-plus" :loading="creating" @click="createPost">
          New post
        </UButton>
      </div>
    </div>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load posts" />
    <UAlert v-if="taxonomyError" color="error" icon="i-lucide-circle-alert" title="Could not load tags or categories" />
    <UAlert v-if="createError" color="error" icon="i-lucide-circle-alert" :title="createError" />
    <UAlert v-if="listError" color="error" icon="i-lucide-circle-alert" :title="listError" />

    <div class="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div v-if="pending" class="grid gap-3 p-5">
        <USkeleton v-for="index in 4" :key="index" class="h-12" />
      </div>

      <div v-else-if="posts.length" class="overflow-x-auto">
        <table class="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead class="bg-stone-50 text-xs uppercase tracking-wider text-stone-500">
            <tr>
              <th class="w-12 px-4 py-3 font-medium">
                <input
                  type="checkbox"
                  class="rounded border-stone-300"
                  :checked="allVisibleSelected"
                  :indeterminate.prop="someVisibleSelected"
                  @click.stop
                  @change="toggleSelectAll($event)"
                >
              </th>
              <th class="min-w-64 px-4 py-3 font-medium">Title</th>
              <th class="min-w-44 px-4 py-3 font-medium">Slug</th>
              <th class="min-w-48 px-4 py-3 font-medium">Tags</th>
              <th class="min-w-48 px-4 py-3 font-medium">Categories</th>
              <th class="min-w-40 px-4 py-3 font-medium">Privacy</th>
              <th class="min-w-32 px-4 py-3 font-medium">Status</th>
              <th class="min-w-32 px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            <tr
              v-for="post in posts"
              :key="post.id"
              class="cursor-default hover:bg-stone-50"
              :class="editingCell?.postId === post.id ? 'bg-teal-50/40' : ''"
              @click="quickEditEnabled ? queueRowEdit(post) : undefined"
              @dblclick="openPost(post)"
            >
              <td class="px-4 py-3 align-top" @click.stop>
                <input v-model="selectedIds" type="checkbox" :value="post.id" class="rounded border-stone-300">
              </td>

              <td class="px-4 py-3 align-top" @click.stop="quickEditEnabled ? startCellEdit(post, 'title') : undefined">
                <input
                  v-if="isEditing(post, 'title')"
                  v-model="draft.title"
                  :data-inline-editor="inlineEditorKey(post.id, 'title')"
                  class="w-full rounded border border-teal-300 bg-white px-2 py-1.5 text-sm font-medium text-stone-950 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  @click.stop
                  @keydown.enter.prevent="saveCurrentCell({ close: true })"
                  @keydown.esc.prevent="cancelCellEdit"
                  @blur="saveCurrentCell({ close: true })"
                >
                <button v-else type="button" class="block w-full text-left font-medium text-stone-950 hover:text-teal-700">
                  {{ post.title || 'Untitled' }}
                </button>
              </td>

              <td class="px-4 py-3 align-top" @click.stop="quickEditEnabled ? startCellEdit(post, 'slug') : undefined">
                <input
                  v-if="isEditing(post, 'slug')"
                  v-model="draft.slug"
                  :data-inline-editor="inlineEditorKey(post.id, 'slug')"
                  class="w-full rounded border border-teal-300 bg-white px-2 py-1.5 text-sm text-stone-700 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  @click.stop
                  @keydown.enter.prevent="saveCurrentCell({ close: true })"
                  @keydown.esc.prevent="cancelCellEdit"
                  @blur="saveCurrentCell({ close: true })"
                >
                <button v-else type="button" class="block w-full text-left text-stone-600 hover:text-teal-700">
                  /{{ post.slug }}
                </button>
              </td>

              <td class="px-4 py-3 align-top" @click.stop="quickEditEnabled ? startCellEdit(post, 'tags') : undefined">
                <div
                  v-if="isEditing(post, 'tags')"
                  :data-inline-editor="inlineEditorKey(post.id, 'tags')"
                  class="grid gap-2 rounded border border-teal-300 bg-white p-2 shadow-sm"
                  tabindex="-1"
                  @click.stop
                  @keydown.esc.prevent="cancelCellEdit"
                  @focusout="handleCellFocusOut"
                >
                  <div class="grid max-h-32 gap-1 overflow-y-auto pr-1">
                    <label v-for="tag in tagOptions" :key="tag.id" class="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-stone-700 hover:bg-stone-50">
                      <input v-model="draft.tagIds" type="checkbox" :value="tag.id" class="rounded border-stone-300" @change="saveCurrentCell()">
                      <span>{{ tag.name }}</span>
                    </label>
                    <p v-if="!tagOptions.length" class="text-xs text-stone-500">No tags yet.</p>
                  </div>
                  <input
                    v-model="draft.tagNamesInput"
                    class="w-full rounded border border-stone-300 px-2 py-1 text-xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                    placeholder="Add tags, comma separated"
                    @keydown.enter.prevent="saveCurrentCell({ close: true })"
                  >
                </div>
                <button v-else type="button" class="block w-full text-left">
                  <span v-if="post.tags?.length" class="flex flex-wrap gap-1">
                    <UBadge v-for="tag in post.tags" :key="tag.id" color="neutral" variant="subtle">{{ tag.name }}</UBadge>
                  </span>
                  <span v-else class="text-stone-400">No tags</span>
                </button>
              </td>

              <td class="px-4 py-3 align-top" @click.stop="quickEditEnabled ? startCellEdit(post, 'categories') : undefined">
                <div
                  v-if="isEditing(post, 'categories')"
                  :data-inline-editor="inlineEditorKey(post.id, 'categories')"
                  class="grid gap-2 rounded border border-teal-300 bg-white p-2 shadow-sm"
                  tabindex="-1"
                  @click.stop
                  @keydown.esc.prevent="cancelCellEdit"
                  @focusout="handleCellFocusOut"
                >
                  <div class="grid max-h-32 gap-1 overflow-y-auto pr-1">
                    <label v-for="category in categoryOptions" :key="category.id" class="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-stone-700 hover:bg-stone-50">
                      <input v-model="draft.categoryIds" type="checkbox" :value="category.id" class="rounded border-stone-300" @change="saveCurrentCell()">
                      <span>{{ category.name }}</span>
                    </label>
                    <p v-if="!categoryOptions.length" class="text-xs text-stone-500">No categories yet.</p>
                  </div>
                  <input
                    v-model="draft.categoryNamesInput"
                    class="w-full rounded border border-stone-300 px-2 py-1 text-xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                    placeholder="Add categories, comma separated"
                    @keydown.enter.prevent="saveCurrentCell({ close: true })"
                  >
                </div>
                <button v-else type="button" class="block w-full text-left">
                  <span v-if="post.categories?.length" class="flex flex-wrap gap-1">
                    <UBadge v-for="category in post.categories" :key="category.id" color="primary" variant="subtle">{{ category.name }}</UBadge>
                  </span>
                  <span v-else class="text-stone-400">No categories</span>
                </button>
              </td>

              <td class="px-4 py-3 align-top" @click.stop="quickEditEnabled ? startCellEdit(post, 'visibility') : undefined">
                <select
                  v-if="isEditing(post, 'visibility')"
                  v-model="draft.visibility"
                  :data-inline-editor="inlineEditorKey(post.id, 'visibility')"
                  class="w-full rounded border border-teal-300 bg-white px-2 py-1.5 text-sm text-stone-700 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  @click.stop
                  @change="handleVisibilityChange(post)"
                  @keydown.esc.prevent="cancelCellEdit"
                  @blur="saveCurrentCell({ close: true })"
                >
                  <option value="public">Public</option>
                  <option value="password">Password protected</option>
                  <option value="private">Private</option>
                </select>
                <button v-else type="button" class="inline-flex items-center gap-1.5 text-stone-700 hover:text-teal-700">
                  <UIcon :name="visibilityIcon(post.visibility)" class="size-4" />
                  <span>{{ visibilityLabel(post.visibility) }}</span>
                </button>
              </td>

              <td class="px-4 py-3 align-top" @click.stop="quickEditEnabled ? startCellEdit(post, 'status') : undefined">
                <select
                  v-if="isEditing(post, 'status')"
                  v-model="draft.status"
                  :data-inline-editor="inlineEditorKey(post.id, 'status')"
                  class="w-full rounded border border-teal-300 bg-white px-2 py-1.5 text-sm text-stone-700 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  @click.stop
                  @change="saveCurrentCell({ close: true })"
                  @keydown.esc.prevent="cancelCellEdit"
                  @blur="saveCurrentCell({ close: true })"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
                <UBadge v-else :color="post.status === 'published' ? 'success' : 'neutral'" variant="subtle">
                  {{ post.status }}
                </UBadge>
              </td>

              <td class="px-4 py-3 align-top text-stone-600">
                <span>{{ formatDate(post.updated_at) }}</span>
                <span v-if="isSavingPost(post.id)" class="mt-1 block text-xs text-teal-700">Saving...</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <UEmpty v-else icon="i-lucide-file-text" title="No posts yet" description="Create your first draft to start building the knowledge base." class="py-12" />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { CategoryRecord, PostRecord, PostStatus, PostVisibility, TagRecord } from '~/types/content'

definePageMeta({ layout: 'admin' })

type PostStatusFilter = PostStatus | 'all'

type EditableField = 'title' | 'slug' | 'tags' | 'categories' | 'visibility' | 'status'

const creating = ref(false)
const statusFilter = ref<PostStatusFilter>('all')
const statusFilterOptions = [
  { label: 'All (active)', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Archived', value: 'archived' }
]
const { data, pending, error, refresh } = await useAsyncData(
  'admin-posts',
  () => $fetch<{ posts: PostRecord[] }>('/api/admin/posts', {
    query: statusFilter.value === 'all' ? {} : { status: statusFilter.value }
  }),
  { watch: [statusFilter] }
)
const { data: taxonomyData, error: taxonomyError, refresh: refreshTaxonomy } = await useAsyncData('admin-post-taxonomy-options', async () => {
  const [tagResponse, categoryResponse] = await Promise.all([
    $fetch<{ tags: TagRecord[] }>('/api/admin/tags'),
    $fetch<{ categories: CategoryRecord[] }>('/api/admin/categories')
  ])

  return {
    tags: tagResponse.tags,
    categories: categoryResponse.categories
  }
})

const posts = computed(() => data.value?.posts ?? [])
const tagOptions = computed(() => taxonomyData.value?.tags ?? [])
const categoryOptions = computed(() => taxonomyData.value?.categories ?? [])

const createError = ref('')
const listError = ref('')
const bulkDeleting = ref(false)
const selectedIds = ref<string[]>([])
const quickEditEnabled = ref(false)
const editingCell = ref<{ postId: string, field: EditableField } | null>(null)
const savingCellKey = ref('')
const rowClickTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const draft = reactive({
  title: '',
  slug: '',
  status: 'draft' as PostStatus,
  visibility: 'public' as PostVisibility,
  tagIds: [] as string[],
  categoryIds: [] as string[],
  tagNamesInput: '',
  categoryNamesInput: '',
  password: ''
})

const allVisibleSelected = computed(() => posts.value.length > 0 && posts.value.every((post) => selectedIds.value.includes(post.id)))
const someVisibleSelected = computed(() => !allVisibleSelected.value && posts.value.some((post) => selectedIds.value.includes(post.id)))
const actionsMenuItems = computed(() => [[
  {
    label: 'Delete',
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onSelect: deleteSelected
  },
  {
    label: 'Edit',
    icon: 'i-lucide-square-pen',
    onSelect: editSelected
  },
  {
    label: quickEditEnabled.value ? 'Disable Quick Edit' : 'Quick Edit',
    icon: quickEditEnabled.value ? 'i-lucide-square-x' : 'i-lucide-file-pen-line',
    onSelect: toggleQuickEdit
  }
]])

onBeforeUnmount(() => {
  clearRowClickTimer()
})

async function createPost() {
  creating.value = true
  createError.value = ''
  try {
    const post = await $fetch<PostRecord>('/api/admin/posts', {
      method: 'POST',
      body: {
        title: 'Untitled note'
      }
    })
    await navigateTo(`/admin/posts/${encodeURIComponent(post.id)}`)
  } catch (error: any) {
    createError.value = error?.statusMessage ?? error?.message ?? 'Could not create post'
    creating.value = false
  }
}

function queueRowEdit(post: PostRecord) {
  clearRowClickTimer()
  rowClickTimer.value = setTimeout(() => {
    startCellEdit(post, 'title')
    rowClickTimer.value = null
  }, 240)
}

async function openPost(post: PostRecord) {
  clearRowClickTimer()
  await navigateTo(`/admin/posts/${encodeURIComponent(post.id)}`)
}

function startCellEdit(post: PostRecord, field: EditableField) {
  if (!quickEditEnabled.value) {
    return
  }

  clearRowClickTimer()
  listError.value = ''
  editingCell.value = { postId: post.id, field }
  draft.title = post.title
  draft.slug = post.slug
  draft.status = post.status === 'archived' ? 'draft' : post.status
  draft.visibility = post.visibility ?? 'public'
  draft.tagIds = post.tags?.map((tag) => tag.id) ?? post.tag_ids ?? []
  draft.categoryIds = post.categories?.map((category) => category.id) ?? post.category_ids ?? []
  draft.tagNamesInput = ''
  draft.categoryNamesInput = ''
  draft.password = ''

  nextTick(() => {
    const editorElement = document.querySelector(`[data-inline-editor="${inlineEditorKey(post.id, field)}"]`) as HTMLElement | null
    editorElement?.focus()

    if (editorElement instanceof HTMLInputElement) {
      editorElement.select()
    }
  })
}

function cancelCellEdit() {
  editingCell.value = null
  listError.value = ''
  savingCellKey.value = ''
}

function isEditing(post: PostRecord, field: EditableField) {
  return editingCell.value?.postId === post.id && editingCell.value.field === field
}

function inlineEditorKey(postId: string, field: EditableField) {
  return `${postId}-${field}`
}

function isSavingPost(postId: string) {
  return savingCellKey.value.startsWith(`${postId}-`)
}

async function saveCurrentCell(options: { close?: boolean } = {}) {
  const cell = editingCell.value
  if (!cell) {
    return
  }

  const currentKey = inlineEditorKey(cell.postId, cell.field)
  if (savingCellKey.value === currentKey) {
    return
  }

  const post = posts.value.find((item) => item.id === cell.postId)
  if (!post) {
    editingCell.value = null
    return
  }

  const body = updateBodyForCell(cell.field)
  savingCellKey.value = currentKey
  listError.value = ''

  try {
    const endpoint: string = `/api/admin/posts/${encodeURIComponent(cell.postId)}`
    await $fetch(endpoint, {
      method: 'PUT',
      body
    })

    const refreshTaxonomyOptions = Boolean(body.tag_names || body.category_names)
    if (refreshTaxonomyOptions) {
      await refreshTaxonomy()
    }
    await refresh()

    if (options.close) {
      editingCell.value = null
    }
  } catch (error: any) {
    listError.value = error?.statusMessage ?? error?.message ?? 'Could not update post'
  } finally {
    savingCellKey.value = ''
  }
}

function updateBodyForCell(field: EditableField): Record<string, unknown> {
  if (field === 'title') {
    return { title: draft.title }
  }

  if (field === 'slug') {
    return { slug: draft.slug }
  }

  if (field === 'status') {
    return { status: draft.status }
  }

  if (field === 'visibility') {
    return {
      visibility: draft.visibility,
      ...(draft.password ? { password: draft.password } : {})
    }
  }

  if (field === 'tags') {
    const tagNames = splitNames(draft.tagNamesInput)
    return {
      tag_ids: draft.tagIds,
      ...(tagNames.length ? { tag_names: tagNames } : {})
    }
  }

  const categoryNames = splitNames(draft.categoryNamesInput)
  return {
    category_ids: draft.categoryIds,
    ...(categoryNames.length ? { category_names: categoryNames } : {})
  }
}

async function handleVisibilityChange(post: PostRecord) {
  if (draft.visibility === 'password' && post.visibility !== 'password') {
    const password = window.prompt('Password for this post')?.trim()
    if (!password) {
      draft.visibility = post.visibility ?? 'public'
      return
    }
    draft.password = password
  }

  await saveCurrentCell({ close: true })
}

function handleCellFocusOut(event: FocusEvent) {
  const currentTarget = event.currentTarget as HTMLElement
  const nextTarget = event.relatedTarget as Node | null

  if (nextTarget && currentTarget.contains(nextTarget)) {
    return
  }

  void saveCurrentCell({ close: true })
}

function toggleSelectAll(event: Event) {
  const checked = (event.target as HTMLInputElement).checked

  if (checked) {
    selectedIds.value = Array.from(new Set([...selectedIds.value, ...posts.value.map((post) => post.id)]))
    return
  }

  const visibleIds = new Set(posts.value.map((post) => post.id))
  selectedIds.value = selectedIds.value.filter((postId) => !visibleIds.has(postId))
}

async function deleteSelected() {
  if (!selectedIds.value.length) {
    return
  }

  bulkDeleting.value = true
  await deletePosts([...selectedIds.value])
  bulkDeleting.value = false
}

async function editSelected() {
  if (!selectedIds.value.length) {
    return
  }

  const selectedId = selectedIds.value[0]
  if (!selectedId) {
    return
  }

  await navigateTo(`/admin/posts/${encodeURIComponent(selectedId)}`)
}

function toggleQuickEdit() {
  quickEditEnabled.value = !quickEditEnabled.value
  if (!quickEditEnabled.value) {
    cancelCellEdit()
  }
}

async function deletePosts(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids))
  if (!uniqueIds.length) {
    return
  }

  const count = uniqueIds.length
  const confirmed = confirm(count === 1
    ? 'Delete this post? It will be archived.'
    : `Delete ${count} posts? They will be archived.`)

  if (!confirmed) {
    return
  }

  listError.value = ''

  try {
    for (const postId of uniqueIds) {
      const endpoint: string = `/api/admin/posts/${encodeURIComponent(postId)}`
      await $fetch(endpoint, {
        method: 'DELETE'
      })
    }

    selectedIds.value = selectedIds.value.filter((postId) => !uniqueIds.includes(postId))
    if (editingCell.value && uniqueIds.includes(editingCell.value.postId)) {
      editingCell.value = null
    }
    await refresh()
  } catch (error: any) {
    listError.value = error?.statusMessage ?? error?.message ?? 'Could not delete selected posts'
  }
}

function splitNames(value: string) {
  return Array.from(new Set(
    value
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
  ))
}

function visibilityLabel(value: PostVisibility | undefined) {
  if (value === 'private') {
    return 'Private'
  }

  if (value === 'password') {
    return 'Password protected'
  }

  return 'Public'
}

function visibilityIcon(value: PostVisibility | undefined) {
  if (value === 'private') {
    return 'i-lucide-eye-off'
  }

  if (value === 'password') {
    return 'i-lucide-lock'
  }

  return 'i-lucide-globe-2'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function clearRowClickTimer() {
  if (!rowClickTimer.value) {
    return
  }

  clearTimeout(rowClickTimer.value)
  rowClickTimer.value = null
}
</script>
