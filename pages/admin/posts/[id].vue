<template>
  <section class="h-[calc(100vh-3.5rem)] overflow-hidden bg-[var(--pb-app-bg)]">
    <div class="z-20 flex min-h-14 items-center justify-between gap-3 border-b border-[var(--pb-divider)] bg-[var(--pb-card-bg)] px-4">
      <div class="flex min-w-0 items-center gap-3">
        <UButton to="/admin/posts" type="button" variant="ghost" color="neutral" icon="i-lucide-arrow-left" size="sm">
          Posts
        </UButton>
        <div class="min-w-0">
          <div class="truncate text-sm font-medium text-[var(--pb-text)]">{{ form.title || 'No title' }}</div>
          <div class="flex items-center gap-2 text-xs text-[var(--pb-text-subtle)]">
            <span>{{ currentStatus }}</span>
            <span v-if="saveStatus" :class="saveStatusClass">· {{ saveStatus }}</span>
            <span v-else-if="post?.updated_at">· Saved {{ formatDate(post.updated_at) }}</span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          type="button"
          icon="i-lucide-save"
          variant="soft"
          :loading="savingAction === 'save-local'"
          :disabled="savingAction !== null"
          @click="saveLocal()"
        >
          Save
        </UButton>
        <UButton
          type="button"
          icon="i-lucide-send"
          color="primary"
          :loading="savingAction === 'publish'"
          :disabled="savingAction !== null"
          @click="publishOrUpdate()"
        >
          {{ currentStatus === 'published' ? 'Update' : 'Publish' }}
        </UButton>
        <UButton
          type="button"
          icon="i-lucide-external-link"
          variant="soft"
          color="neutral"
          :to="viewLink || undefined"
          target="_blank"
          :disabled="!viewLink"
        >
          View
        </UButton>
        <UDropdownMenu :items="moreMenuItems">
          <UButton type="button" icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" />
        </UDropdownMenu>
      </div>
    </div>

    <div v-if="pending" class="mx-auto grid max-w-3xl gap-5 px-6 py-10">
      <USkeleton class="h-14" />
      <USkeleton class="h-96" />
    </div>

    <div v-else class="relative flex h-[calc(100vh-7rem)] overflow-hidden">
      <BlockInserterPanel
        :open="editorStore.inserterOpen"
        inline
        @close="editorStore.closeInserter()"
        @insert="onInserterPick"
      />

      <main
        class="min-w-0 flex-1 overflow-y-auto px-4 py-6 transition-[padding] duration-200 md:px-6 lg:px-8"
        :class="editorStore.inserterOpen ? 'pl-[336px] md:pl-[348px] lg:pl-[356px]' : ''"
      >
        <div class="pb-content-frame mx-auto">
          <div class="mb-4 space-y-3">
            <UAlert v-if="loadError" color="error" icon="i-lucide-circle-alert" title="Could not load this post" />
            <UAlert v-if="saveError" color="error" icon="i-lucide-circle-alert" :title="saveError" />
          </div>

          <form class="pb-editor-grid-shell rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] px-6 py-6 shadow-[var(--pb-shadow-sm)] md:px-10 md:py-8" @submit.prevent="saveLocal()">
            <div class="pb-editor-row mb-8">
              <div class="pb-editor-gutter" aria-hidden="true" />
              <input
                v-model="form.title"
                type="text"
                placeholder="Add title"
                class="w-full border-0 bg-transparent text-5xl font-semibold leading-tight tracking-normal text-[var(--pb-text)] outline-none placeholder:text-[var(--pb-text-placeholder)]"
              >
              <div class="pb-editor-gutter" aria-hidden="true" />
            </div>

            <BlockEditor ref="blockEditorRef" v-model="form.content" :use-inline-inserter="true" />
          </form>
        </div>
      </main>

      <div class="relative h-full shrink-0 border-l border-[var(--pb-divider)] bg-[var(--pb-card-bg)] transition-[width]" :class="rightPaneCollapsed ? 'w-11' : 'w-[340px]'">
        <button
          type="button"
          class="absolute left-1 top-2 z-20 inline-flex size-7 items-center justify-center rounded-[var(--pb-radius-sm)] border border-[var(--pb-divider)] bg-[var(--pb-card-bg)] text-[var(--pb-icon-muted)] hover:border-[var(--pb-selected-border)] hover:text-[var(--pb-link-hover)]"
          :title="rightPaneCollapsed ? 'Expand right pane' : 'Collapse right pane'"
          @click="rightPaneCollapsed = !rightPaneCollapsed"
        >
          <UIcon :name="rightPaneCollapsed ? 'i-lucide-chevrons-left' : 'i-lucide-chevrons-right'" class="size-4" />
        </button>

        <EditorSidebar
          v-if="!rightPaneCollapsed"
          class="h-full w-[340px]"
          :form="form"
          :categories="categories"
          :tags="tags"
          :current-status="currentStatus"
          :editor="activeEditor"
          :uploading-cover="uploadingCover"
          @upload-cover="handleCoverUpload"
        />
      </div>
    </div>

    <UModal v-model:open="leaveDialogOpen">
      <template #content>
        <UCard>
          <template #header>
            <div>
              <h3 class="text-base font-semibold text-[var(--pb-text)]">Unsaved changes</h3>
              <p class="text-xs text-[var(--pb-text-subtle)]">Leave this editor, save to database, or discard local edits.</p>
            </div>
          </template>

          <div class="text-sm text-[var(--pb-text-muted)]">
            Your edits are not saved to the database yet.
          </div>

          <template #footer>
            <div class="flex flex-wrap justify-end gap-2">
              <UButton type="button" color="neutral" variant="ghost" :disabled="savingAction === 'save-db'" @click="cancelLeave">Cancel</UButton>
              <UButton type="button" color="warning" variant="soft" :disabled="savingAction === 'save-db'" @click="discardAndLeave">Discard</UButton>
              <UButton type="button" color="primary" icon="i-lucide-save" :loading="savingAction === 'save-db'" @click="saveAndLeave">Save to DB</UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </section>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import BlockEditor from '~/components/admin/editor/blocks/BlockEditor.vue'
import BlockInserterPanel from '~/components/admin/editor/blocks/BlockInserterPanel.vue'
import EditorSidebar from '~/components/admin/editor/EditorSidebar.vue'
import type { CategoryRecord, JsonContent, PostRecord, PostStatus, TagRecord } from '~/types/content'
import type { AdminPostEditorForm } from '~/types/editor'

definePageMeta({ layout: 'admin', adminWide: true, adminHideSidebar: true })

type BlockEditorInstance = InstanceType<typeof BlockEditor> & { editor?: Editor, pickBlock?: (name: string) => void }
const readFetchTimeoutMs = 10_000
const writeFetchTimeoutMs = 30_000

const route = useRoute()
const id = computed(() => String(route.params.id))
const apiPath = computed(() => `/api/admin/posts/${encodeURIComponent(id.value)}`)
const savingAction = ref<'save-local' | 'save-db' | 'publish' | 'unpublish' | null>(null)
const saveStatus = ref('')
const saveStatusType = ref<'success' | 'error'>('success')
const saveError = ref('')
const currentStatus = ref<PostStatus>('draft')
const uploadingCover = ref(false)
const blockEditorRef = ref<BlockEditorInstance | null>(null)
const editorStore = useEditorStore()
const rightPaneCollapsed = ref(false)
const leaveDialogOpen = ref(false)
const pendingLeavePath = ref<string | null>(null)
const bypassLeaveGuard = ref(false)
const hasLoadedDbSnapshot = ref(false)
const savedDbSnapshot = ref('')

const saveStatusClass = computed(() =>
  saveStatusType.value === 'error' ? 'text-red-600' : 'text-[var(--pb-text-subtle)]'
)

function onInserterPick(name: string) {
  blockEditorRef.value?.pickBlock?.(name)
}
const activeEditor = computed(() => blockEditorRef.value?.editor ?? null)

const form = reactive<AdminPostEditorForm>({
  title: '',
  slug: '',
  summary: '',
  cover_image: '',
  category_ids: [],
  tag_ids: [],
  category_names: [],
  tag_names: [],
  is_featured: false,
  featured_at: null,
  visibility: 'public',
  password: '',
  password_hint: '',
  content: emptyDoc()
})

const viewLink = computed(() => {
  const slug = form.slug?.trim() || post.value?.slug?.trim() || ''
  return slug ? `/blog/${encodeURIComponent(slug)}` : ''
})

const { data: post, pending, error: loadError } = useLazyAsyncData(`admin-post-${id.value}`, () => fetchAdmin<PostRecord>(apiPath.value))
const { data: categoriesData, refresh: refreshCategories } = useLazyAsyncData('admin-post-categories', () => fetchAdmin<{ categories: CategoryRecord[] }>('/api/admin/categories'), { default: () => ({ categories: [] }) })
const { data: tagsData, refresh: refreshTags } = useLazyAsyncData('admin-post-tags', () => fetchAdmin<{ tags: TagRecord[] }>('/api/admin/tags'), { default: () => ({ tags: [] }) })
const categories = computed(() => categoriesData.value?.categories ?? [])
const tags = computed(() => tagsData.value?.tags ?? [])

const moreMenuItems = computed(() => {
  const items: any[][] = []
  if (currentStatus.value === 'published') {
    items.push([{
      label: 'Unpublish',
      icon: 'i-lucide-rotate-ccw',
      onSelect: () => save('draft', 'unpublish')
    }])
  }
  items.push([{
    label: 'Archive',
    icon: 'i-lucide-archive',
    color: 'error' as const,
    onSelect: archivePost
  }])
  return items
})

watch(post, (value) => {
  if (!value) {
    return
  }

  form.title = value.title
  form.slug = value.slug
  form.summary = value.summary ?? ''
  form.cover_image = value.cover_image ?? ''
  form.category_ids = [...(value.category_ids ?? [])]
  form.tag_ids = [...(value.tag_ids ?? [])]
  form.category_names = []
  form.tag_names = []
  form.is_featured = value.is_featured
  form.featured_at = value.featured_at ?? null
  currentStatus.value = value.status === 'archived' ? 'draft' : value.status
  form.visibility = value.visibility ?? 'public'
  form.password_hint = value.password_hint ?? ''
  form.password = ''
  form.content = value.content_json
  savedDbSnapshot.value = serializeDbPayload()
  hasLoadedDbSnapshot.value = true
}, { immediate: true })

const hasUnsavedDbChanges = computed(() => {
  if (!hasLoadedDbSnapshot.value) {
    return false
  }

  return serializeDbPayload() !== savedDbSnapshot.value
})

// ─── LOCAL SAVE (localStorage) ───────────────────────────────────────────────
const localStorageKey = computed(() => `pb-post-local-${id.value}`)

function saveLocal() {
  savingAction.value = 'save-local'
  saveError.value = ''
  try {
    const payload = {
      title: form.title,
      slug: form.slug,
      summary: form.summary,
      cover_image: form.cover_image,
      category_ids: form.category_ids,
      tag_ids: form.tag_ids,
      category_names: form.category_names,
      tag_names: form.tag_names,
      is_featured: form.is_featured,
      featured_at: form.featured_at,
      visibility: form.visibility,
      password: form.password,
      password_hint: form.password_hint,
      content_json: form.content
    }
    localStorage.setItem(localStorageKey.value, JSON.stringify(payload))
    const timeStr = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())
    saveStatus.value = `Saved locally at ${timeStr}`
    saveStatusType.value = 'success'
  } catch (err: any) {
    saveError.value = 'Local save failed'
    saveStatus.value = 'Save failed'
    saveStatusType.value = 'error'
  } finally {
    savingAction.value = null
  }
}

function clearLocalSave() {
  localStorage.removeItem(localStorageKey.value)
}

function loadLocalSave() {
  try {
    const raw = localStorage.getItem(localStorageKey.value)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

// ─── PUBLISH / UPDATE (DB write) ─────────────────────────────────────────────
async function publishOrUpdate() {
  await save('published', 'publish')
}

async function save(nextStatus: PostStatus, action: 'save-db' | 'publish' | 'unpublish') {
  savingAction.value = action
  saveStatus.value = 'Saving...'
  saveStatusType.value = 'success'
  saveError.value = ''

  try {
    const saved = await fetchAdmin<PostRecord>(apiPath.value, {
      method: 'PUT',
      body: {
        title: form.title,
        slug: form.slug,
        summary: form.summary,
        cover_image: form.cover_image,
        category_ids: form.category_ids,
        tag_ids: form.tag_ids,
        category_names: form.category_names,
        tag_names: form.tag_names,
        is_featured: form.is_featured,
        featured_at: form.featured_at,
        status: nextStatus,
        visibility: form.visibility,
        password: form.password,
        password_hint: form.password_hint,
        content_json: form.content
      }
    })

    form.slug = saved.slug
    currentStatus.value = saved.status === 'archived' ? 'draft' : saved.status
    form.category_ids = [...(saved.category_ids ?? form.category_ids)]
    form.tag_ids = [...(saved.tag_ids ?? form.tag_ids)]
    form.category_names = []
    form.tag_names = []
    form.is_featured = saved.is_featured
    form.featured_at = saved.featured_at ?? null
    form.visibility = saved.visibility ?? form.visibility
    form.password_hint = saved.password_hint ?? ''
    form.password = ''
    post.value = saved
    savedDbSnapshot.value = serializeDbPayload()
    hasLoadedDbSnapshot.value = true
    clearLocalSave()
    await Promise.all([refreshCategories(), refreshTags()])

    const timeStr = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())
    if (action === 'publish') {
      saveStatus.value = currentStatus.value === 'published' ? `Updated at ${timeStr}` : `Published at ${timeStr}`
    } else if (action === 'save-db') {
      saveStatus.value = `Saved to DB at ${timeStr}`
    } else if (action === 'unpublish') {
      saveStatus.value = `Unpublished at ${timeStr}`
    }
    saveStatusType.value = 'success'
    return true
  } catch (err: any) {
    saveError.value = err?.statusMessage ?? err?.message ?? 'Save failed'
    saveStatus.value = 'Save failed'
    saveStatusType.value = 'error'
    return false
  } finally {
    savingAction.value = null
  }
}

async function archivePost() {
  await fetchAdmin(apiPath.value, { method: 'DELETE' })
  await navigateTo('/admin/posts')
}

// 5-minute auto-save: triggers only when the page is mounted, when no manual
// save is already in flight, and only saves as draft (never publishes).
let autoSaveTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  // Restore local draft if available
  const local = loadLocalSave()
  if (local && post.value) {
    Object.assign(form, {
      title: local.title ?? form.title,
      slug: local.slug ?? form.slug,
      summary: local.summary ?? form.summary,
      cover_image: local.cover_image ?? form.cover_image,
      category_ids: local.category_ids ?? form.category_ids,
      tag_ids: local.tag_ids ?? form.tag_ids,
      category_names: local.category_names ?? [],
      tag_names: local.tag_names ?? [],
      is_featured: local.is_featured ?? form.is_featured,
      featured_at: local.featured_at ?? form.featured_at,
      visibility: local.visibility ?? form.visibility,
      password: local.password ?? '',
      password_hint: local.password_hint ?? form.password_hint,
      content: local.content_json ?? form.content
    })
    saveStatus.value = 'Unsaved local changes'
    saveStatusType.value = 'success'
  }

  autoSaveTimer = setInterval(() => {
    if (savingAction.value) return
    if (currentStatus.value === 'archived') return
    saveLocal()
  }, 5 * 60 * 1000)

  window.addEventListener('beforeunload', handleBeforeUnload)
})
onBeforeUnmount(() => {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer)
    autoSaveTimer = null
  }

  window.removeEventListener('beforeunload', handleBeforeUnload)
})

onBeforeRouteLeave((to) => {
  if (bypassLeaveGuard.value || !hasUnsavedDbChanges.value || savingAction.value === 'save-db') {
    return true
  }

  pendingLeavePath.value = to.fullPath
  leaveDialogOpen.value = true
  return false
})

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (bypassLeaveGuard.value || !hasUnsavedDbChanges.value || savingAction.value === 'save-db') {
    return
  }

  event.preventDefault()
  event.returnValue = ''
}

function cancelLeave() {
  leaveDialogOpen.value = false
  pendingLeavePath.value = null
}

async function discardAndLeave() {
  await continueLeaveNavigation()
}

async function saveAndLeave() {
  const ok = await save(currentStatus.value, 'save-db')
  if (!ok) {
    return
  }

  await continueLeaveNavigation()
}

async function continueLeaveNavigation() {
  const targetPath = pendingLeavePath.value
  leaveDialogOpen.value = false
  pendingLeavePath.value = null
  if (!targetPath) {
    return
  }

  bypassLeaveGuard.value = true
  try {
    await navigateTo(targetPath)
  } finally {
    bypassLeaveGuard.value = false
  }
}

function serializeDbPayload() {
  return JSON.stringify({
    title: form.title,
    slug: form.slug,
    summary: form.summary,
    cover_image: form.cover_image,
    category_ids: form.category_ids,
    tag_ids: form.tag_ids,
    category_names: form.category_names,
    tag_names: form.tag_names,
    is_featured: form.is_featured,
    featured_at: form.featured_at,
    visibility: form.visibility,
    password: form.password,
    password_hint: form.password_hint,
    content_json: form.content,
    status: currentStatus.value
  })
}

function emptyDoc(): JsonContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [] }]
  }
}

async function handleCoverUpload(file: File) {
  uploadingCover.value = true

  try {
    const formData = new FormData()
    formData.append('file', file)
    const asset = await fetchAdmin<{ url: string }>('/api/admin/upload', {
      method: 'POST',
      body: formData
    })

    if (asset.url) {
      form.cover_image = asset.url
    }
  } finally {
    uploadingCover.value = false
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function fetchAdmin<T>(url: string, options: Record<string, unknown> = {}) {
  const method = String(options.method ?? 'GET').toUpperCase()
  const timeoutMs = method === 'GET' ? readFetchTimeoutMs : writeFetchTimeoutMs

  return $fetch<T>(url, {
    timeout: timeoutMs,
    ...options
  })
}
</script>

<style scoped>
.pb-content-frame {
  max-width: var(--pb-post-content-max-width);
}

.pb-editor-grid-shell {
  --pb-editor-gutter: 32px;
  --pb-editor-gap: 8px;
}

.pb-editor-row {
  display: grid;
  grid-template-columns: var(--pb-editor-gutter) minmax(0, 1fr) var(--pb-editor-gutter);
  column-gap: var(--pb-editor-gap);
  align-items: start;
}

.pb-editor-gutter {
  width: var(--pb-editor-gutter);
}
</style>
