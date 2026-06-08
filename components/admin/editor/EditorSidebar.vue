<template>
  <aside class="h-full border-l border-stone-200 bg-white">
    <div class="sticky top-0 z-10 flex border-b border-stone-200 bg-white">
      <button
        type="button"
        class="flex-1 border-b-2 px-4 py-3 text-sm font-medium"
        :class="editorStore.sidebarTab === 'post' ? 'border-teal-600 text-teal-700' : 'border-transparent text-stone-500 hover:text-stone-900'"
        @click="editorStore.setSidebarTab('post')"
      >
        Post
      </button>
      <button
        type="button"
        class="flex-1 border-b-2 px-4 py-3 text-sm font-medium"
        :class="editorStore.sidebarTab === 'block' ? 'border-teal-600 text-teal-700' : 'border-transparent text-stone-500 hover:text-stone-900'"
        @click="editorStore.setSidebarTab('block')"
      >
        Block
      </button>
    </div>

    <div class="h-[calc(100%-3rem)] overflow-y-auto">
      <div v-if="editorStore.sidebarTab === 'post'" class="space-y-4 p-4">
        <div class="flex items-center justify-between rounded-md bg-stone-50 px-3 py-2 text-sm">
          <span class="text-stone-500">Status</span>
          <UBadge :color="currentStatus === 'published' ? 'success' : 'neutral'" variant="subtle">{{ currentStatus }}</UBadge>
        </div>

        <details open class="rounded-md border border-stone-200 p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Summary & Slug</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Slug">
            <UInput v-model="form.slug" icon="i-lucide-link" />
          </UFormField>
          <UFormField label="Excerpt">
            <UTextarea v-model="form.summary" :rows="4" />
          </UFormField>
        </div>
      </details>

      <details open class="rounded-md border border-stone-200 p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Template</summary>
        <div class="mt-3">
          <USelect v-model="selectedTemplate" :items="templateItems" />
        </div>
      </details>

      <details open class="rounded-md border border-stone-200 p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Cover Image</summary>
        <div class="mt-3 space-y-3">
          <div v-if="form.cover_image" class="relative overflow-hidden rounded-md border border-stone-200">
            <img :src="form.cover_image" alt="" class="h-36 w-full object-cover">
            <UButton type="button" icon="i-lucide-x" size="xs" color="neutral" variant="solid" class="absolute right-2 top-2" @click="form.cover_image = ''" />
          </div>
          <div class="flex gap-2">
            <UButton type="button" icon="i-lucide-upload" size="sm" variant="soft" :loading="uploadingCover" @click="coverInput?.click()">Upload</UButton>
            <UButton type="button" icon="i-lucide-link" size="sm" color="neutral" variant="soft" @click="setCoverFromUrl">URL</UButton>
          </div>
          <UInput v-model="coverUrl" size="sm" placeholder="https://..." @keydown.enter.prevent="setCoverFromUrl" />
          <input ref="coverInput" type="file" accept="image/*" class="hidden" @change="handleCoverUpload">
        </div>
      </details>

      <details open class="rounded-md border border-stone-200 p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Categories</summary>
        <div class="mt-3 space-y-2">
          <div class="flex gap-2">
            <UInput
              v-model="newCategoryName"
              size="sm"
              icon="i-lucide-plus"
              placeholder="Add category and press Enter"
              @keydown.enter.prevent="addCategoryName"
            />
            <UButton type="button" size="sm" variant="soft" color="neutral" @click="addCategoryName">Add</UButton>
          </div>

          <div v-if="form.category_names.length" class="flex flex-wrap gap-2">
            <UBadge
              v-for="name in form.category_names"
              :key="name"
              color="primary"
              variant="subtle"
              class="flex items-center gap-1"
            >
              {{ name }}
              <button type="button" class="inline-flex" @click="removeCategoryName(name)">
                <UIcon name="i-lucide-x" class="size-3" />
              </button>
            </UBadge>
          </div>

          <label v-for="category in categories" :key="category.id" class="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
            <input v-model="form.category_ids" type="checkbox" :value="category.id" class="rounded border-stone-300">
            <span>{{ category.name }}</span>
          </label>
          <p v-if="!categories.length" class="text-sm text-stone-500">No categories yet.</p>
        </div>
      </details>

      <details open class="rounded-md border border-stone-200 p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Tags</summary>
        <div class="mt-3 space-y-2">
          <div class="flex gap-2">
            <UInput
              v-model="newTagName"
              size="sm"
              icon="i-lucide-plus"
              placeholder="Add tag and press Enter"
              @keydown.enter.prevent="addTagName"
            />
            <UButton type="button" size="sm" variant="soft" color="neutral" @click="addTagName">Add</UButton>
          </div>

          <div v-if="form.tag_names.length" class="flex flex-wrap gap-2">
            <UBadge
              v-for="name in form.tag_names"
              :key="name"
              color="primary"
              variant="subtle"
              class="flex items-center gap-1"
            >
              {{ name }}
              <button type="button" class="inline-flex" @click="removeTagName(name)">
                <UIcon name="i-lucide-x" class="size-3" />
              </button>
            </UBadge>
          </div>

          <label v-for="tag in tags" :key="tag.id" class="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
            <input v-model="form.tag_ids" type="checkbox" :value="tag.id" class="rounded border-stone-300">
            <span>{{ tag.name }}</span>
          </label>
          <p v-if="!tags.length" class="text-sm text-stone-500">No tags yet.</p>
        </div>
      </details>

      <details open class="rounded-md border border-stone-200 p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Visibility</summary>
        <div class="mt-3 space-y-3">
          <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input v-model="form.visibility" type="radio" value="public" class="mt-1">
            <span><span class="font-medium">Public</span><span class="block text-xs text-stone-500">Anyone can read this post.</span></span>
          </label>
          <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input v-model="form.visibility" type="radio" value="private" class="mt-1">
            <span><span class="font-medium">Private</span><span class="block text-xs text-stone-500">Hidden from public lists and search.</span></span>
          </label>
          <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input v-model="form.visibility" type="radio" value="password" class="mt-1">
            <span class="flex-1">
              <span class="font-medium">Password protected</span>
              <span class="block text-xs text-stone-500">Hidden from public lists and search, content requires a password.</span>
              <span v-if="form.visibility === 'password'" class="mt-2 grid gap-2">
                <input v-model="form.password" type="password" placeholder="Leave blank to keep existing password" class="w-full rounded border border-stone-300 px-2 py-1 text-sm" autocomplete="new-password">
                <input v-model="form.password_hint" type="text" placeholder="Hint shown on lock screen" class="w-full rounded border border-stone-300 px-2 py-1 text-sm">
              </span>
            </span>
          </label>
        </div>
        </details>
      </div>

      <div v-else class="p-4">
        <BlockSettings :editor="editor" />
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { CategoryRecord, PostStatus, TagRecord } from '~/types/content'
import type { AdminPostEditorForm } from '~/types/editor'
// Explicit import: Nuxt auto-registers nested components with a path prefix
// (`AdminEditorBlockSettings`), so the short `<BlockSettings>` tag below
// would otherwise fail to resolve.
import BlockSettings from '~/components/admin/editor/blocks/BlockSettings.vue'

const props = defineProps<{
  form: AdminPostEditorForm
  categories: CategoryRecord[]
  tags: TagRecord[]
  currentStatus: PostStatus
  editor: Editor | null
  uploadingCover?: boolean
}>()

const emit = defineEmits<{
  'upload-cover': [file: File]
}>()

const editorStore = useEditorStore()
const coverInput = ref<HTMLInputElement>()
const coverUrl = ref('')
const newCategoryName = ref('')
const newTagName = ref('')
const selectedTemplate = ref('default')
const templateItems = [{ label: 'Default post template', value: 'default' }]

function setCoverFromUrl() {
  const value = coverUrl.value.trim()
  if (!value) {
    return
  }

  props.form.cover_image = value
  coverUrl.value = ''
}

function handleCoverUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''

  if (file) {
    emit('upload-cover', file)
  }
}

function addCategoryName() {
  const value = newCategoryName.value.trim()
  if (!value) {
    return
  }

  if (!containsName(props.form.category_names, value)) {
    props.form.category_names.push(value)
  }

  newCategoryName.value = ''
}

function removeCategoryName(name: string) {
  props.form.category_names = props.form.category_names.filter((item) => item !== name)
}

function addTagName() {
  const value = newTagName.value.trim()
  if (!value) {
    return
  }

  if (!containsName(props.form.tag_names, value)) {
    props.form.tag_names.push(value)
  }

  newTagName.value = ''
}

function removeTagName(name: string) {
  props.form.tag_names = props.form.tag_names.filter((item) => item !== name)
}

function containsName(values: string[], target: string) {
  const normalizedTarget = target.toLowerCase()
  return values.some((value) => value.toLowerCase() === normalizedTarget)
}
</script>