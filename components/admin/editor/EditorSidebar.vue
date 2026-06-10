<template>
  <aside class="h-full border-l border-stone-200 bg-white">
    <div class="sticky top-0 z-10 flex border-b border-stone-200 bg-white">
      <button
        type="button"
        class="flex-1 border-b-2 px-4 py-3 text-sm font-medium"
        :class="editorStore.sidebarTab === 'post' ? 'border-teal-600 text-teal-700' : 'border-transparent text-stone-500 hover:text-stone-900'"
        @click="editorStore.setSidebarTab('post')"
      >
        {{ t('admin.editor.sidebar.post') }}
      </button>
      <button
        type="button"
        class="flex-1 border-b-2 px-4 py-3 text-sm font-medium"
        :class="editorStore.sidebarTab === 'block' ? 'border-teal-600 text-teal-700' : 'border-transparent text-stone-500 hover:text-stone-900'"
        @click="editorStore.setSidebarTab('block')"
      >
        {{ t('admin.editor.sidebar.block') }}
      </button>
    </div>

    <div class="h-[calc(100%-3rem)] overflow-y-auto">
      <div v-if="editorStore.sidebarTab === 'post'" class="space-y-4 p-4">
        <div class="flex items-center justify-between rounded-md bg-stone-50 px-3 py-2 text-sm">
          <span class="text-stone-500">{{ t('admin.editor.sidebar.status') }}</span>
          <UBadge :color="currentStatus === 'published' ? 'success' : 'neutral'" variant="subtle">{{ statusLabel(currentStatus) }}</UBadge>
        </div>

        <details open class="rounded-md border border-stone-200 p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">{{ t('admin.editor.sidebar.summarySlug') }}</summary>
        <div class="mt-3 space-y-3">
          <UFormField :label="t('admin.editor.sidebar.slug')">
            <UInput v-model="form.slug" icon="i-lucide-link" />
          </UFormField>
          <UFormField :label="t('admin.editor.sidebar.excerpt')">
            <UTextarea v-model="form.summary" :rows="4" />
          </UFormField>
        </div>
      </details>

      <details open class="rounded-md border border-stone-200 p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">{{ t('admin.editor.sidebar.template') }}</summary>
        <div class="mt-3">
          <USelect v-model="selectedTemplate" :items="templateItems" />
        </div>
      </details>

      <details open class="rounded-md border border-stone-200 p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">{{ t('admin.editor.sidebar.coverImage') }}</summary>
        <div class="mt-3 space-y-3">
          <div v-if="form.cover_image" class="space-y-2">
            <div class="overflow-hidden rounded-md border border-stone-200">
              <img :src="form.cover_image" :alt="t('admin.editor.sidebar.coverImageAlt')" class="h-36 w-full object-cover">
            </div>
            <div class="flex gap-2">
              <UButton type="button" icon="i-lucide-image-plus" size="sm" variant="soft" class="flex-1" @click="coverPickerOpen = true">{{ t('admin.editor.sidebar.replace') }}</UButton>
              <UButton type="button" icon="i-lucide-x" size="sm" color="neutral" variant="ghost" @click="form.cover_image = ''">{{ t('admin.common.clear') }}</UButton>
            </div>
          </div>
          <UButton
            v-else
            type="button"
            icon="i-lucide-image-plus"
            color="primary"
            block
            @click="coverPickerOpen = true"
          >
            {{ t('admin.editor.sidebar.chooseCoverImage') }}
          </UButton>
        </div>
      </details>

      <details open class="rounded-md border border-stone-200 p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">{{ t('admin.editor.sidebar.categories') }}</summary>
        <div class="mt-3 space-y-2">
          <div class="flex gap-2">
            <UInput
              v-model="newCategoryName"
              size="sm"
              icon="i-lucide-plus"
              :placeholder="t('admin.editor.sidebar.addCategoryEnter')"
              @keydown.enter.prevent="addCategoryName"
            />
            <UButton type="button" size="sm" variant="soft" color="neutral" @click="addCategoryName">{{ t('admin.common.add') }}</UButton>
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
          <p v-if="!categories.length" class="text-sm text-stone-500">{{ t('admin.posts.noCategoriesYet') }}</p>
        </div>
      </details>

      <details open class="rounded-md border border-stone-200 p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">{{ t('admin.editor.sidebar.tags') }}</summary>
        <div class="mt-3 space-y-2">
          <div class="flex gap-2">
            <UInput
              v-model="newTagName"
              size="sm"
              icon="i-lucide-plus"
              :placeholder="t('admin.editor.sidebar.addTagEnter')"
              @keydown.enter.prevent="addTagName"
            />
            <UButton type="button" size="sm" variant="soft" color="neutral" @click="addTagName">{{ t('admin.common.add') }}</UButton>
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
          <p v-if="!tags.length" class="text-sm text-stone-500">{{ t('admin.posts.noTagsYet') }}</p>
        </div>
      </details>

      <details open class="rounded-md border border-stone-200 p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">{{ t('admin.editor.sidebar.visibility') }}</summary>
        <div class="mt-3 space-y-3">
          <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input v-model="form.visibility" type="radio" value="public" class="mt-1">
            <span><span class="font-medium">{{ t('admin.posts.visibility.public') }}</span><span class="block text-xs text-stone-500">{{ t('admin.editor.sidebar.publicDescription') }}</span></span>
          </label>
          <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input v-model="form.visibility" type="radio" value="private" class="mt-1">
            <span><span class="font-medium">{{ t('admin.posts.visibility.private') }}</span><span class="block text-xs text-stone-500">{{ t('admin.editor.sidebar.privateDescription') }}</span></span>
          </label>
          <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input v-model="form.visibility" type="radio" value="password" class="mt-1">
            <span class="flex-1">
              <span class="font-medium">{{ t('admin.posts.visibility.password') }}</span>
              <span class="block text-xs text-stone-500">{{ t('admin.editor.sidebar.passwordDescription') }}</span>
            </span>
          </label>

          <div v-if="form.visibility === 'password'" class="mt-3 space-y-3 rounded-md border border-stone-200 bg-stone-50 p-3">
            <input
              v-model="form.password"
              type="password"
              :placeholder="t('admin.editor.sidebar.passwordPlaceholder')"
              class="w-full rounded border border-stone-300 px-2 py-1 text-sm"
              autocomplete="new-password"
            >
            <input
              v-model="form.password_hint"
              type="text"
              :placeholder="t('admin.editor.sidebar.passwordHintPlaceholder')"
              class="w-full rounded border border-stone-300 px-2 py-1 text-sm"
            >
          </div>
        </div>
        </details>
      </div>

      <div v-else class="p-4">
        <BlockSettings :editor="editor" />
      </div>
    </div>

    <MediaPicker
      :open="coverPickerOpen"
      return-value="url"
      type-filter="image"
      @update:open="coverPickerOpen = $event"
      @select="onCoverPicked"
    />
  </aside>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { CategoryRecord, MediaRecord, PostStatus, TagRecord } from '~/types/content'
import type { AdminPostEditorForm } from '~/types/editor'
// Explicit import: Nuxt auto-registers nested components with a path prefix
// (`AdminEditorBlockSettings`), so the short `<BlockSettings>` tag below
// would otherwise fail to resolve.
import BlockSettings from '~/components/admin/editor/blocks/BlockSettings.vue'
import MediaPicker from '~/components/admin/media/MediaPicker.vue'

const props = defineProps<{
  form: AdminPostEditorForm
  categories: CategoryRecord[]
  tags: TagRecord[]
  currentStatus: PostStatus
  editor: Editor | null
}>()

const editorStore = useEditorStore()
const { t } = useI18n()
const coverPickerOpen = ref(false)
const newCategoryName = ref('')
const newTagName = ref('')
const selectedTemplate = ref('default')
const templateItems = computed(() => [{ label: t('admin.editor.sidebar.defaultTemplate'), value: 'default' }])

function statusLabel(status: PostStatus) {
  return t(`admin.posts.status.${status}`)
}

function onCoverPicked(files: MediaRecord[]) {
  const first = files[0]
  if (first?.url) {
    props.form.cover_image = first.url
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