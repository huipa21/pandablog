<template>
  <section class="min-h-[calc(100vh-3.5rem)] bg-stone-50">
    <div class="sticky top-14 z-20 flex min-h-14 items-center justify-between gap-3 border-b border-stone-200 bg-white px-4">
      <div class="flex min-w-0 items-center gap-3">
        <UButton to="/admin/posts" type="button" variant="ghost" color="neutral" icon="i-lucide-arrow-left" size="sm">
          Posts
        </UButton>
        <div class="min-w-0">
          <div class="truncate text-sm font-medium text-stone-900">{{ form.title || 'No title' }}</div>
          <div class="flex items-center gap-2 text-xs text-stone-500">
            <span>{{ currentStatus }}</span>
            <span v-if="post?.updated_at">Saved {{ formatDate(post.updated_at) }}</span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          type="button"
          icon="i-lucide-save"
          variant="soft"
          :loading="savingAction === 'save-draft'"
          :disabled="savingAction !== null"
          @click="save('draft', 'save-draft')"
        >
          Save draft
        </UButton>
        <UButton
          type="button"
          icon="i-lucide-send"
          color="primary"
          :loading="savingAction === 'publish'"
          :disabled="savingAction !== null"
          @click="save('published', 'publish')"
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
        <UButton
          v-if="currentStatus === 'published'"
          type="button"
          icon="i-lucide-rotate-ccw"
          color="warning"
          variant="soft"
          :loading="savingAction === 'unpublish'"
          :disabled="savingAction !== null"
          @click="save('draft', 'unpublish')"
        >
          Unpublish
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

    <div v-else class="flex min-h-[calc(100vh-7rem)]">
      <BlockInserterPanel
        :open="editorStore.inserterOpen"
        inline
        @close="editorStore.closeInserter()"
        @insert="onInserterPick"
      />

      <main class="min-w-0 flex-1 px-4 py-6 md:px-6 lg:px-8">
        <div class="mx-auto w-full max-w-6xl">
          <div class="mb-4 space-y-3">
            <UAlert v-if="loadError" color="error" icon="i-lucide-circle-alert" title="Could not load this post" />
            <UAlert v-if="saveError" color="error" icon="i-lucide-circle-alert" :title="saveError" />
            <UAlert v-if="notice" color="success" icon="i-lucide-check" :title="notice" />
          </div>

          <form class="rounded-lg border border-stone-200 bg-white px-6 py-6 shadow-sm md:px-10 md:py-8" @submit.prevent="save('draft', 'save-draft')">
            <input
              v-model="form.title"
              type="text"
              placeholder="Add title"
              class="mb-8 w-full border-0 bg-transparent text-5xl font-semibold leading-tight tracking-normal text-stone-900 outline-none placeholder:text-stone-400"
            >

            <BlockEditor ref="blockEditorRef" v-model="form.content" :use-inline-inserter="true" />
          </form>
        </div>
      </main>

      <EditorSidebar
        class="w-[340px] shrink-0"
        :form="form"
        :categories="categories"
        :tags="tags"
        :current-status="currentStatus"
        :editor="activeEditor"
        :uploading-cover="uploadingCover"
        @upload-cover="handleCoverUpload"
      />
    </div>
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

type BlockEditorInstance = InstanceType<typeof BlockEditor> & { editor?: Ref<Editor | undefined>, pickBlock?: (name: string) => void }
const fetchTimeoutMs = 10_000

const route = useRoute()
const id = computed(() => String(route.params.id))
const apiPath = computed(() => `/api/admin/posts/${encodeURIComponent(id.value)}`)
const savingAction = ref<'save-draft' | 'publish' | 'unpublish' | null>(null)
const notice = ref('')
const saveError = ref('')
const currentStatus = ref<PostStatus>('draft')
const uploadingCover = ref(false)
const blockEditorRef = ref<BlockEditorInstance | null>(null)
const editorStore = useEditorStore()

function onInserterPick(name: string) {
  blockEditorRef.value?.pickBlock?.(name)
}
const activeEditor = computed(() => blockEditorRef.value?.editor?.value ?? null)

const form = reactive<AdminPostEditorForm>({
  title: '',
  slug: '',
  summary: '',
  cover_image: '',
  category_ids: [],
  tag_ids: [],
  category_names: [],
  tag_names: [],
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

const moreMenuItems = computed(() => [[
  {
    label: 'Archive',
    icon: 'i-lucide-archive',
    color: 'error' as const,
    onSelect: archivePost
  }
]])

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
  currentStatus.value = value.status === 'archived' ? 'draft' : value.status
  form.visibility = value.visibility ?? 'public'
  form.password_hint = value.password_hint ?? ''
  form.password = ''
  form.content = value.content_json
}, { immediate: true })

async function save(nextStatus: PostStatus, action: 'save-draft' | 'publish' | 'unpublish') {
  savingAction.value = action
  notice.value = ''
  saveError.value = ''
  const previousStatus = currentStatus.value

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
    form.visibility = saved.visibility ?? form.visibility
    form.password_hint = saved.password_hint ?? ''
    form.password = ''
    post.value = saved
    await Promise.all([refreshCategories(), refreshTags()])

    if (action === 'publish') {
      notice.value = previousStatus === 'published' ? 'Updated' : 'Published'
    } else if (action === 'unpublish') {
      notice.value = 'Moved to draft'
    } else {
      notice.value = 'Saved draft'
    }
  } catch (err: any) {
    saveError.value = err?.statusMessage ?? err?.message ?? 'Save failed'
  } finally {
    savingAction.value = null
  }
}

async function archivePost() {
  await fetchAdmin(apiPath.value, { method: 'DELETE' })
  await navigateTo('/admin/posts')
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
  return $fetch<T>(url, {
    timeout: fetchTimeoutMs,
    ...options
  })
}
</script>
