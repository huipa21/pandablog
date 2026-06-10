<template>
  <section class="grid gap-6">
    <div class="grid gap-4">
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-primary)]">{{ t('admin.posts.contentEyebrow') }}</p>
          <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('admin.posts.eyebrow') }}</h1>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge v-if="selectedIds.length" color="neutral" variant="subtle">{{ t('admin.posts.selected', { count: selectedIds.length }) }}</UBadge>
          <UDropdownMenu v-if="selectedIds.length" :items="actionsMenuItems">
            <UButton icon="i-lucide-list-checks" color="neutral" variant="soft" :loading="bulkDeleting" :disabled="bulkDeleting">
              {{ t('admin.common.actions') }}
            </UButton>
          </UDropdownMenu>
          <UBadge v-if="quickEditEnabled && !isArchivedView" color="primary" variant="subtle">{{ t('admin.posts.quickEditOn') }}</UBadge>
          <UButton icon="i-lucide-plus" :loading="creating" @click="createPost">
            {{ t('admin.posts.newPost') }}
          </UButton>
        </div>
      </div>

      <div class="pb-admin-surface flex flex-wrap items-center gap-2 p-3">
        <USelect v-model="statusFilter" :items="statusFilterOptions" size="sm" class="w-40" />
        <USelect v-model="sortBy" :items="sortOptions" size="sm" class="w-48" />
        <AdminMultiSelectFilter
          v-model="selectedCategoryIds"
          :items="categoryFilterOptions"
          :label="t('admin.taxonomy.categoriesTitle')"
          :placeholder="t('admin.taxonomy.categoriesTitle')"
          icon="i-lucide-folder"
        />
        <AdminMultiSelectFilter
          v-model="selectedTagIds"
          :items="tagFilterOptions"
          :label="t('admin.taxonomy.tagsTitle')"
          :placeholder="t('admin.taxonomy.tagsTitle')"
          icon="i-lucide-tags"
        />
        <USelect v-model="perPage" :items="perPageOptions" size="sm" class="w-28" />
        <UButton v-if="filtersActive" size="sm" variant="ghost" color="neutral" icon="i-lucide-x" @click="clearFilters">
          {{ t('admin.common.clear') }}
        </UButton>
      </div>
    </div>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :title="t('admin.posts.loadFailed')" />
    <UAlert v-if="taxonomyError" color="error" icon="i-lucide-circle-alert" :title="t('admin.posts.taxonomyLoadFailed')" />

    <div class="pb-admin-surface overflow-hidden">
      <div v-if="pending" class="grid gap-3 p-5">
        <USkeleton v-for="index in 4" :key="index" class="h-12" />
      </div>

      <div v-else-if="posts.length" class="overflow-x-auto">
        <table class="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead class="bg-[var(--pb-surface-subtle)] text-xs uppercase tracking-wider text-[var(--pb-text-subtle)]">
            <tr>
              <th class="w-12 px-4 py-3 font-medium">
                <input
                  type="checkbox"
                  class="rounded border-[var(--pb-border-strong)]"
                  :checked="allVisibleSelected"
                  :indeterminate.prop="someVisibleSelected"
                  @click.stop
                  @change="toggleSelectAll($event)"
                >
              </th>
              <th class="min-w-64 px-4 py-3 font-medium">{{ t('admin.posts.table.title') }}</th>
              <th class="min-w-48 px-4 py-3 font-medium">{{ t('admin.posts.table.tags') }}</th>
              <th class="min-w-48 px-4 py-3 font-medium">{{ t('admin.posts.table.categories') }}</th>
              <th class="min-w-40 px-4 py-3 font-medium">{{ t('admin.posts.table.privacy') }}</th>
              <th class="min-w-32 px-4 py-3 font-medium">{{ t('admin.posts.table.status') }}</th>
              <th class="min-w-32 px-4 py-3 font-medium">{{ t('admin.posts.table.length') }}</th>
              <th class="min-w-36 px-4 py-3 font-medium">{{ t('admin.posts.table.published') }}</th>
              <th class="min-w-32 px-4 py-3 font-medium">{{ t('admin.posts.table.updated') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--pb-border)]">
            <tr
              v-for="post in posts"
              :key="post.id"
              class="cursor-default hover:bg-[var(--pb-surface-subtle)]"
              :class="editingCell?.postId === post.id ? 'pb-selected-surface' : ''"
              @click="quickEditEnabled ? queueRowEdit(post) : undefined"
              @dblclick="openPost(post)"
            >
              <td class="px-4 py-3 align-top" @click.stop>
                <input v-model="selectedIds" type="checkbox" :value="post.id" class="rounded border-[var(--pb-border-strong)]">
              </td>

              <td class="px-4 py-3 align-top" @click.stop="quickEditEnabled ? startCellEdit(post, 'title') : undefined">
                <input
                  v-if="isEditing(post, 'title')"
                  v-model="draft.title"
                  :data-inline-editor="inlineEditorKey(post.id, 'title')"
                  class="w-full rounded-[var(--pb-radius-sm)] border border-[var(--pb-selected-border)] bg-[var(--pb-card-bg)] px-2 py-1.5 text-sm font-medium text-[var(--pb-text)] shadow-[var(--pb-shadow-sm)] outline-none focus:border-[var(--pb-selected-border)] focus:ring-2 focus:ring-[var(--pb-selected-border)]"
                  @click.stop
                  @keydown.enter.prevent="saveCurrentCell({ close: true })"
                  @keydown.esc.prevent="cancelCellEdit"
                  @blur="saveCurrentCell({ close: true })"
                >
                <button v-else type="button" class="block w-full text-left font-medium text-[var(--pb-text)] hover:text-[var(--pb-link-hover)]">
                  {{ post.title || t('admin.common.untitled') }}
                </button>
              </td>

              <td class="px-4 py-3 align-top" @click.stop="quickEditEnabled ? startCellEdit(post, 'tags') : undefined">
                <div
                  v-if="isEditing(post, 'tags')"
                  :data-inline-editor="inlineEditorKey(post.id, 'tags')"
                  class="grid gap-2 rounded-[var(--pb-radius-sm)] border border-[var(--pb-selected-border)] bg-[var(--pb-card-bg)] p-2 shadow-[var(--pb-shadow-sm)]"
                  tabindex="-1"
                  @click.stop
                  @keydown.esc.prevent="cancelCellEdit"
                  @focusout="handleCellFocusOut"
                >
                  <div class="grid max-h-32 gap-1 overflow-y-auto pr-1">
                    <label v-for="tag in tagOptions" :key="tag.id" class="flex cursor-pointer items-center gap-2 rounded-[var(--pb-radius-sm)] px-1 py-0.5 text-xs text-[var(--pb-text-muted)] hover:bg-[var(--pb-selected-bg)]">
                      <input v-model="draft.tagIds" type="checkbox" :value="tag.id" class="rounded border-[var(--pb-border-strong)]" @change="saveCurrentCell()">
                      <span>{{ tag.name }}</span>
                    </label>
                    <p v-if="!tagOptions.length" class="text-xs text-[var(--pb-text-subtle)]">{{ t('admin.posts.noTagsYet') }}</p>
                  </div>
                  <input
                    v-model="draft.tagNamesInput"
                    class="w-full rounded-[var(--pb-radius-sm)] border border-[var(--pb-border-strong)] bg-[var(--pb-card-bg)] px-2 py-1 text-xs text-[var(--pb-text)] outline-none focus:border-[var(--pb-selected-border)] focus:ring-2 focus:ring-[var(--pb-selected-border)]"
                    :placeholder="t('admin.posts.addTags')"
                    @keydown.enter.prevent="saveCurrentCell({ close: true })"
                  >
                </div>
                <button v-else type="button" class="block w-full text-left">
                  <span v-if="post.tags?.length" class="flex flex-wrap gap-1">
                    <UBadge v-for="tag in post.tags" :key="tag.id" color="neutral" variant="subtle">{{ tag.name }}</UBadge>
                  </span>
                  <span v-else class="text-[var(--pb-text-subtle)]">{{ t('admin.common.noTags') }}</span>
                </button>
              </td>

              <td class="px-4 py-3 align-top" @click.stop="quickEditEnabled ? startCellEdit(post, 'categories') : undefined">
                <div
                  v-if="isEditing(post, 'categories')"
                  :data-inline-editor="inlineEditorKey(post.id, 'categories')"
                  class="grid gap-2 rounded-[var(--pb-radius-sm)] border border-[var(--pb-selected-border)] bg-[var(--pb-card-bg)] p-2 shadow-[var(--pb-shadow-sm)]"
                  tabindex="-1"
                  @click.stop
                  @keydown.esc.prevent="cancelCellEdit"
                  @focusout="handleCellFocusOut"
                >
                  <div class="grid max-h-32 gap-1 overflow-y-auto pr-1">
                    <label v-for="category in categoryOptions" :key="category.id" class="flex cursor-pointer items-center gap-2 rounded-[var(--pb-radius-sm)] px-1 py-0.5 text-xs text-[var(--pb-text-muted)] hover:bg-[var(--pb-selected-bg)]">
                      <input v-model="draft.categoryIds" type="checkbox" :value="category.id" class="rounded border-[var(--pb-border-strong)]" @change="saveCurrentCell()">
                      <span>{{ category.name }}</span>
                    </label>
                    <p v-if="!categoryOptions.length" class="text-xs text-[var(--pb-text-subtle)]">{{ t('admin.posts.noCategoriesYet') }}</p>
                  </div>
                  <input
                    v-model="draft.categoryNamesInput"
                    class="w-full rounded-[var(--pb-radius-sm)] border border-[var(--pb-border-strong)] bg-[var(--pb-card-bg)] px-2 py-1 text-xs text-[var(--pb-text)] outline-none focus:border-[var(--pb-selected-border)] focus:ring-2 focus:ring-[var(--pb-selected-border)]"
                    :placeholder="t('admin.posts.addCategories')"
                    @keydown.enter.prevent="saveCurrentCell({ close: true })"
                  >
                </div>
                <button v-else type="button" class="block w-full text-left">
                  <span v-if="post.categories?.length" class="flex flex-wrap gap-1">
                    <UBadge v-for="category in post.categories" :key="category.id" color="primary" variant="subtle">{{ category.name }}</UBadge>
                  </span>
                  <span v-else class="text-[var(--pb-text-subtle)]">{{ t('admin.common.noCategories') }}</span>
                </button>
              </td>

              <td class="px-4 py-3 align-top" @click.stop="quickEditEnabled ? startCellEdit(post, 'visibility') : undefined">
                <select
                  v-if="isEditing(post, 'visibility')"
                  v-model="draft.visibility"
                  :data-inline-editor="inlineEditorKey(post.id, 'visibility')"
                  class="w-full rounded-[var(--pb-radius-sm)] border border-[var(--pb-selected-border)] bg-[var(--pb-card-bg)] px-2 py-1.5 text-sm text-[var(--pb-text-muted)] shadow-[var(--pb-shadow-sm)] outline-none focus:border-[var(--pb-selected-border)] focus:ring-2 focus:ring-[var(--pb-selected-border)]"
                  @click.stop
                  @change="handleVisibilityChange(post)"
                  @keydown.esc.prevent="cancelCellEdit"
                  @blur="handleVisibilityBlur"
                >
                  <option value="public">{{ t('admin.posts.visibility.public') }}</option>
                  <option value="password">{{ t('admin.posts.visibility.password') }}</option>
                  <option value="private">{{ t('admin.posts.visibility.private') }}</option>
                </select>
                <button v-else type="button" class="inline-flex items-center gap-1.5 text-[var(--pb-text-muted)] hover:text-[var(--pb-link-hover)]">
                  <UIcon :name="visibilityIcon(post.visibility)" class="size-4" />
                  <span>{{ visibilityLabel(post.visibility) }}</span>
                </button>
              </td>

              <td class="px-4 py-3 align-top" @click.stop="quickEditEnabled ? startCellEdit(post, 'status') : undefined">
                <select
                  v-if="isEditing(post, 'status')"
                  v-model="draft.status"
                  :data-inline-editor="inlineEditorKey(post.id, 'status')"
                  class="w-full rounded-[var(--pb-radius-sm)] border border-[var(--pb-selected-border)] bg-[var(--pb-card-bg)] px-2 py-1.5 text-sm text-[var(--pb-text-muted)] shadow-[var(--pb-shadow-sm)] outline-none focus:border-[var(--pb-selected-border)] focus:ring-2 focus:ring-[var(--pb-selected-border)]"
                  @click.stop
                  @change="saveCurrentCell({ close: true })"
                  @keydown.esc.prevent="cancelCellEdit"
                  @blur="saveCurrentCell({ close: true })"
                >
                  <option value="draft">{{ t('admin.posts.status.draft') }}</option>
                  <option value="published">{{ t('admin.posts.status.published') }}</option>
                </select>
                <UBadge v-else :color="post.status === 'published' ? 'success' : 'neutral'" variant="subtle">
                  {{ statusLabel(post.status) }}
                </UBadge>
              </td>

              <td class="px-4 py-3 align-top text-[var(--pb-text-muted)]">
                <span class="block text-sm">{{ formatContentLength(post) }}</span>
              </td>

              <td class="px-4 py-3 align-top text-[var(--pb-text-muted)]">
                {{ formatDate(post.published_at, t('admin.posts.notPublished')) }}
              </td>

              <td class="px-4 py-3 align-top text-[var(--pb-text-muted)]">
                <span>{{ formatDate(post.updated_at, t('admin.posts.notSet')) }}</span>
                <span v-if="isSavingPost(post.id)" class="mt-1 block text-xs text-[var(--pb-link)]">{{ t('admin.posts.saving') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <UEmpty v-else icon="i-lucide-file-text" :title="t('admin.posts.emptyTitle')" :description="t('admin.posts.emptyDescription')" class="py-12" />

      <div v-if="!pending && totalPosts > 0" class="flex flex-col gap-3 border-t border-[var(--pb-border)] px-4 py-3 text-sm text-[var(--pb-text-muted)] md:flex-row md:items-center md:justify-between">
        <span>{{ pageRangeLabel }}</span>
        <div class="flex items-center gap-2">
          <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevrons-left" :aria-label="t('admin.common.firstPage')" :disabled="page <= 1" @click="goToPage(1)" />
          <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevron-left" :aria-label="t('admin.common.previousPage')" :disabled="page <= 1" @click="goToPage(page - 1)" />
          <span class="min-w-24 text-center">{{ t('admin.common.pageOf', { page, total: totalPages }) }}</span>
          <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevron-right" :aria-label="t('admin.common.nextPage')" :disabled="page >= totalPages" @click="goToPage(page + 1)" />
          <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevrons-right" :aria-label="t('admin.common.lastPage')" :disabled="page >= totalPages" @click="goToPage(totalPages)" />
        </div>
      </div>
    </div>

    <AdminConfirmActionDialog
      :open="confirmDialog.open"
      :title="confirmDialog.title"
      :description="confirmDialog.description"
      :confirm-label="confirmDialog.confirmLabel"
      :confirm-color="confirmDialog.confirmColor"
      :loading="bulkDeleting"
      @update:open="(value) => { if (!value) closeConfirmDialog() }"
      @cancel="closeConfirmDialog"
      @confirm="confirmBulkAction"
    />

    <AdminPromptDialog
      :open="passwordDialogOpen"
      :title="t('admin.posts.passwordPrompt.title')"
      :description="t('admin.posts.passwordPrompt.description')"
      :label="t('admin.posts.passwordPrompt.label')"
      input-type="password"
      :confirm-label="t('admin.posts.passwordPrompt.confirm')"
      @update:open="(value) => { if (!value) cancelPasswordDialog() }"
      @cancel="cancelPasswordDialog"
      @confirm="confirmPasswordDialog"
    />
  </section>
</template>

<script setup lang="ts">
import type { CategoryRecord, PostRecord, PostStatus, PostVisibility, TagRecord } from '~/types/content'

definePageMeta({ layout: 'admin' })

type PostStatusFilter = PostStatus | 'all'
type BulkIntent = 'archive' | 'hard-delete' | 'mixed'
type AdminPostSort = 'updated_desc' | 'updated_asc' | 'published_desc' | 'published_asc'
type PerPageOption = '10' | '25' | '50' | '100'

type EditableField = 'title' | 'tags' | 'categories' | 'visibility' | 'status'

const { t } = useI18n()
const { formatAdminDate, formatAdminNumber } = useAdminRegionalSettings()
const creating = ref(false)
const statusFilter = ref<PostStatusFilter>('all')
const statusFilterOptions = computed(() => [
  { label: t('admin.posts.filters.allActive'), value: 'all' },
  { label: t('admin.posts.filters.draft'), value: 'draft' },
  { label: t('admin.posts.filters.published'), value: 'published' },
  { label: t('admin.posts.filters.archived'), value: 'archived' }
])
const sortBy = ref<AdminPostSort>('updated_desc')
const sortOptions = computed(() => [
  { label: t('admin.posts.filters.updatedNewest'), value: 'updated_desc' },
  { label: t('admin.posts.filters.updatedOldest'), value: 'updated_asc' },
  { label: t('admin.posts.filters.publishedNewest'), value: 'published_desc' },
  { label: t('admin.posts.filters.publishedOldest'), value: 'published_asc' }
])
const perPage = ref<PerPageOption>('10')
const perPageOptions = computed(() => [
  { label: t('admin.common.perPage', { count: 10 }), value: '10' },
  { label: t('admin.common.perPage', { count: 25 }), value: '25' },
  { label: t('admin.common.perPage', { count: 50 }), value: '50' },
  { label: t('admin.common.perPage', { count: 100 }), value: '100' }
])
const selectedTagIds = ref<string[]>([])
const selectedCategoryIds = ref<string[]>([])
const page = ref(1)
const perPageNumber = computed(() => Number(perPage.value))
const start = computed(() => (page.value - 1) * perPageNumber.value)
const postListQuery = computed(() => ({
  ...(statusFilter.value === 'all' ? {} : { status: statusFilter.value }),
  sort: sortBy.value,
  limit: perPageNumber.value,
  start: start.value,
  ...(selectedTagIds.value.length ? { tag_ids: selectedTagIds.value.join(',') } : {}),
  ...(selectedCategoryIds.value.length ? { category_ids: selectedCategoryIds.value.join(',') } : {})
}))
const { data, pending, error, refresh } = await useAsyncData(
  'admin-posts',
  () => $fetch<{ posts: PostRecord[], total: number, limit: number, start: number }>('/api/admin/posts', {
    query: postListQuery.value
  }),
  { watch: [postListQuery] }
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
const totalPosts = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(totalPosts.value / perPageNumber.value)))
const pageRangeLabel = computed(() => {
  if (!totalPosts.value) {
    return t('admin.posts.showingZero')
  }

  const first = start.value + 1
  const last = Math.min(start.value + posts.value.length, totalPosts.value)
  return t('admin.posts.showingRange', { first, last, total: totalPosts.value })
})
const tagOptions = computed(() => taxonomyData.value?.tags ?? [])
const categoryOptions = computed(() => taxonomyData.value?.categories ?? [])
const tagFilterOptions = computed(() => tagOptions.value.map((tag) => ({ id: tag.id, name: tag.name })))
const categoryFilterOptions = computed(() => flattenCategoryOptions(categoryOptions.value).map((entry) => ({
  id: entry.category.id,
  name: entry.category.name,
  level: entry.level
})))
const isArchivedView = computed(() => statusFilter.value === 'archived')
const filtersActive = computed(() => statusFilter.value !== 'all'
  || sortBy.value !== 'updated_desc'
  || selectedTagIds.value.length > 0
  || selectedCategoryIds.value.length > 0)

const adminToast = useAdminToast()
const bulkDeleting = ref(false)
const selectedIds = ref<string[]>([])
const quickEditEnabled = ref(false)
const editingCell = ref<{ postId: string, field: EditableField } | null>(null)
const savingCellKey = ref('')
const rowClickTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const passwordDialogOpen = ref(false)
const pendingPasswordPost = ref<PostRecord | null>(null)
const draft = reactive({
  title: '',
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
const selectedPosts = computed(() => posts.value.filter((post) => selectedIds.value.includes(post.id)))
const selectedIntent = computed<BulkIntent>(() => {
  if (!selectedPosts.value.length) {
    return 'archive'
  }

  const archivedCount = selectedPosts.value.filter((post) => post.status === 'archived').length
  if (archivedCount === selectedPosts.value.length) {
    return 'hard-delete'
  }

  if (archivedCount === 0) {
    return 'archive'
  }

  return 'mixed'
})
const selectedActionLabel = computed(() => {
  if (selectedIntent.value === 'hard-delete') {
    return t('admin.posts.actions.deletePermanently')
  }

  if (selectedIntent.value === 'mixed') {
    return t('admin.posts.actions.archiveDelete')
  }

  return t('admin.posts.actions.archive')
})

const confirmDialog = reactive({
  open: false,
  intent: 'archive' as BulkIntent,
  title: '',
  description: '',
  confirmLabel: t('admin.posts.actions.archive'),
  confirmColor: 'primary' as 'primary' | 'error' | 'neutral',
  ids: [] as string[]
})

const actionsMenuItems = computed(() => [[
  ...(isArchivedView.value
    ? [
        {
          label: t('admin.posts.actions.restore'),
          icon: 'i-lucide-rotate-ccw',
          color: 'primary' as const,
          onSelect: restoreSelected
        },
        {
          label: t('admin.posts.actions.deletePermanently'),
          icon: 'i-lucide-trash-2',
          color: 'error' as const,
          onSelect: deletePermanentlySelected
        }
      ]
    : [
        {
          label: selectedActionLabel.value,
          icon: selectedIntent.value === 'archive' ? 'i-lucide-archive' : 'i-lucide-trash-2',
          color: selectedIntent.value === 'archive' ? ('primary' as const) : ('error' as const),
          onSelect: openBulkActionDialog
        },
        {
          label: t('admin.posts.actions.edit'),
          icon: 'i-lucide-square-pen',
          onSelect: editSelected
        },
        {
          label: quickEditEnabled.value ? t('admin.posts.actions.disableQuickEdit') : t('admin.posts.actions.quickEdit'),
          icon: quickEditEnabled.value ? 'i-lucide-square-x' : 'i-lucide-file-pen-line',
          onSelect: toggleQuickEdit
        }
      ])
]])

onBeforeUnmount(() => {
  clearRowClickTimer()
})

watch([statusFilter, sortBy, perPage, selectedTagIds, selectedCategoryIds], () => {
  page.value = 1
  selectedIds.value = []
  cancelCellEdit()
  closeConfirmDialog()
  if (statusFilter.value === 'archived' && quickEditEnabled.value) {
    quickEditEnabled.value = false
    cancelCellEdit()
  }
})

watch(page, () => {
  selectedIds.value = []
  cancelCellEdit()
  closeConfirmDialog()
})

watch(totalPages, (next) => {
  if (page.value > next) {
    page.value = next
  }
})

async function createPost() {
  creating.value = true
  try {
    const post = await $fetch<PostRecord>('/api/admin/posts', {
      method: 'POST',
      body: {
        title: t('admin.posts.untitledNote')
      }
    })
    await navigateTo(`/admin/posts/${encodeURIComponent(post.id)}`)
  } catch (error: any) {
    adminToast.error(error, t('admin.posts.createFailed'))
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
  editingCell.value = { postId: post.id, field }
  draft.title = post.title
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
    adminToast.error(error, t('admin.posts.updateFailed'))
  } finally {
    savingCellKey.value = ''
  }
}

function updateBodyForCell(field: EditableField): Record<string, unknown> {
  if (field === 'title') {
    return { title: draft.title }
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
    pendingPasswordPost.value = post
    passwordDialogOpen.value = true
    return
  }

  await saveCurrentCell({ close: true })
}

function cancelPasswordDialog() {
  const post = pendingPasswordPost.value
  passwordDialogOpen.value = false
  pendingPasswordPost.value = null
  draft.visibility = post?.visibility ?? 'public'
  editingCell.value = null
}

async function confirmPasswordDialog(password: string) {
  draft.password = password
  passwordDialogOpen.value = false
  pendingPasswordPost.value = null
  await saveCurrentCell({ close: true })
}

function handleVisibilityBlur() {
  if (passwordDialogOpen.value) {
    return
  }

  void saveCurrentCell({ close: true })
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

function openBulkActionDialog() {
  if (!selectedIds.value.length) {
    return
  }

  const uniqueIds = Array.from(new Set(selectedIds.value))
  const count = uniqueIds.length
  const intent = selectedIntent.value

  let title = ''
  let description = ''
  let confirmLabel = ''
  let confirmColor: 'primary' | 'error' | 'neutral' = 'primary'

  if (intent === 'hard-delete') {
    title = t(count === 1 ? 'admin.posts.bulk.deleteOneTitle' : 'admin.posts.bulk.deleteManyTitle', { count })
    description = t(count === 1 ? 'admin.posts.bulk.deleteOneDescription' : 'admin.posts.bulk.deleteManyDescription')
    confirmLabel = t(count === 1 ? 'admin.posts.bulk.deleteOneConfirm' : 'admin.posts.bulk.deleteManyConfirm', { count })
    confirmColor = 'error'
  } else if (intent === 'mixed') {
    title = t(count === 1 ? 'admin.posts.bulk.mixedOneTitle' : 'admin.posts.bulk.mixedManyTitle', { count })
    description = t('admin.posts.bulk.mixedDescription')
    confirmLabel = t('admin.common.continue')
    confirmColor = 'error'
  } else {
    title = t(count === 1 ? 'admin.posts.bulk.archiveOneTitle' : 'admin.posts.bulk.archiveManyTitle', { count })
    description = t(count === 1 ? 'admin.posts.bulk.archiveOneDescription' : 'admin.posts.bulk.archiveManyDescription')
    confirmLabel = t(count === 1 ? 'admin.posts.bulk.archiveOneConfirm' : 'admin.posts.bulk.archiveManyConfirm', { count })
    confirmColor = 'primary'
  }

  confirmDialog.open = true
  confirmDialog.intent = intent
  confirmDialog.title = title
  confirmDialog.description = description
  confirmDialog.confirmLabel = confirmLabel
  confirmDialog.confirmColor = confirmColor
  confirmDialog.ids = uniqueIds
}

function deletePermanentlySelected() {
  if (!selectedIds.value.length) {
    return
  }

  const uniqueIds = Array.from(new Set(selectedIds.value))
  const count = uniqueIds.length

  confirmDialog.open = true
  confirmDialog.intent = 'hard-delete'
  confirmDialog.title = t(count === 1 ? 'admin.posts.bulk.deleteOneTitle' : 'admin.posts.bulk.deleteManyTitle', { count })
  confirmDialog.description = t(count === 1 ? 'admin.posts.bulk.deleteOneDescription' : 'admin.posts.bulk.deleteManyDescription')
  confirmDialog.confirmLabel = t(count === 1 ? 'admin.posts.bulk.deleteOneConfirm' : 'admin.posts.bulk.deleteManyConfirm', { count })
  confirmDialog.confirmColor = 'error'
  confirmDialog.ids = uniqueIds
}

async function restoreSelected() {
  if (!selectedIds.value.length) {
    return
  }

  const uniqueIds = Array.from(new Set(selectedIds.value))
  bulkDeleting.value = true

  try {
    await Promise.all(uniqueIds.map((postId) => {
      const endpoint = `/api/admin/posts/${encodeURIComponent(postId)}`
      return $fetch(endpoint, {
        method: 'PUT',
        body: { status: 'draft' }
      })
    }))

    selectedIds.value = selectedIds.value.filter((postId) => !uniqueIds.includes(postId))
    if (editingCell.value && uniqueIds.includes(editingCell.value.postId)) {
      editingCell.value = null
    }
    await refresh()
    adminToast.success(t('admin.posts.bulk.restoredTitle'), t('admin.posts.bulk.restoredDescription', { count: uniqueIds.length }))
  } catch (error: any) {
    adminToast.error(error, t('admin.posts.bulk.restoreFailed'))
  } finally {
    bulkDeleting.value = false
  }
}

function closeConfirmDialog() {
  if (bulkDeleting.value) {
    return
  }

  confirmDialog.open = false
  confirmDialog.ids = []
}

async function confirmBulkAction() {
  if (!confirmDialog.ids.length) {
    closeConfirmDialog()
    return
  }

  bulkDeleting.value = true
  try {
    await deletePosts(confirmDialog.ids)
  } finally {
    bulkDeleting.value = false
    closeConfirmDialog()
  }
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

  try {
    const response = await $fetch<{
      archived: number
      deleted: number
      failed: number
      archived_ids: string[]
      deleted_ids: string[]
      failures: Array<{ id: string, message: string }>
    }>('/api/admin/posts/bulk', {
      method: 'DELETE',
      body: {
        ids: uniqueIds
      }
    })

    const processedIds = new Set([...(response.archived_ids ?? []), ...(response.deleted_ids ?? [])])

    selectedIds.value = selectedIds.value.filter((postId) => !processedIds.has(postId))
    if (editingCell.value && processedIds.has(editingCell.value.postId)) {
      editingCell.value = null
    }

    const processed = Number(response.archived ?? 0) + Number(response.deleted ?? 0)
    if (processed > 0) {
      adminToast.success(t('admin.posts.bulk.updatedTitle'), bulkPostResultDescription(response.archived, response.deleted))
    }

    if (response.failed > 0) {
      const firstFailure = response.failures?.[0]?.message ?? t('admin.posts.bulk.partialFailedFallback')
      adminToast.error(new Error(t('admin.posts.bulk.partialFailedMessage', { count: response.failed, message: firstFailure })), t('admin.posts.bulk.partialFailedTitle'))
    }

    await refresh()
  } catch (error: any) {
    adminToast.error(error, t('admin.posts.bulk.processFailed'))
  }
}

function bulkPostResultDescription(archived: number, deleted: number) {
  const parts = []
  if (archived > 0) {
    parts.push(t('admin.posts.bulk.resultArchived', { count: archived }))
  }
  if (deleted > 0) {
    parts.push(t('admin.posts.bulk.resultDeleted', { count: deleted }))
  }
  return `${parts.join(', ')}.`
}

function splitNames(value: string) {
  return Array.from(new Set(
    value
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
  ))
}

function clearFilters() {
  statusFilter.value = 'all'
  sortBy.value = 'updated_desc'
  selectedTagIds.value = []
  selectedCategoryIds.value = []
  page.value = 1
}

function goToPage(nextPage: number) {
  page.value = Math.min(Math.max(nextPage, 1), totalPages.value)
}

function flattenCategoryOptions(categories: CategoryRecord[]) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  const nonDefaultCategories = categories.filter((category) => category.slug !== 'default')
  const childrenByParent = new Map<string | null, CategoryRecord[]>()
  const rows: Array<{ category: CategoryRecord, level: number }> = []

  for (const category of nonDefaultCategories) {
    const parentId = category.parent_id && categoryMap.has(category.parent_id) && categoryMap.get(category.parent_id)?.slug !== 'default'
      ? category.parent_id
      : null
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), category])
  }

  for (const children of childrenByParent.values()) {
    children.sort((left, right) => left.name.localeCompare(right.name))
  }

  for (const category of categories.filter((item) => item.slug === 'default').sort((left, right) => left.name.localeCompare(right.name))) {
    rows.push({ category, level: 0 })
  }

  appendCategoryRows(null, 0)
  return rows

  function appendCategoryRows(parentId: string | null, level: number) {
    for (const category of childrenByParent.get(parentId) ?? []) {
      rows.push({ category, level })
      appendCategoryRows(category.id, level + 1)
    }
  }
}

function visibilityLabel(value: PostVisibility | undefined) {
  if (value === 'private') {
    return t('admin.posts.visibility.private')
  }

  if (value === 'password') {
    return t('admin.posts.visibility.password')
  }

  return t('admin.posts.visibility.public')
}

function statusLabel(value: PostStatus) {
  return t(`admin.posts.status.${value}`)
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

function formatDate(value: string | null | undefined, fallback: string) {
  return formatAdminDate(value, fallback)
}

function formatContentLength(post: PostRecord) {
  const words = Number(post.word_count ?? 0)
  const cjk = Number(post.cjk_char_count ?? 0)
  if (!words && !cjk) return '—'
  const parts: string[] = []
  if (cjk) parts.push(t('admin.posts.contentLength.chars', { count: formatAdminNumber(cjk) }))
  if (words) parts.push(t('admin.posts.contentLength.words', { count: formatAdminNumber(words) }))
  return parts.join(' · ')
}

function clearRowClickTimer() {
  if (!rowClickTimer.value) {
    return
  }

  clearTimeout(rowClickTimer.value)
  rowClickTimer.value = null
}
</script>
