<template>
  <UModal v-model:open="open" :modal="!nestedModalOpen" :dismissible="!nestedModalOpen" :ui="{ overlay: 'z-[1090]', content: 'z-[1100] w-[calc(100vw-1rem)] max-w-5xl overflow-hidden sm:w-[calc(100vw-2rem)]' }">
    <template #content>
      <UCard class="flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden" :ui="{ body: 'flex-1 min-h-0 overflow-y-auto p-4 sm:p-6' }">
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.editor.postSettings.title') }}</h3>
              <p class="text-sm text-[var(--pb-text-subtle)]">{{ t('admin.editor.postSettings.description') }}</p>
            </div>
            <UBadge :color="currentStatus === 'published' ? 'success' : 'neutral'" variant="subtle">{{ statusLabel(currentStatus) }}</UBadge>
          </div>
        </template>

        <div class="pr-1">
          <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section class="space-y-5">
              <div class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
                <h4 class="text-sm font-semibold text-[var(--pb-text)]">{{ t('admin.editor.sidebar.summarySlug') }}</h4>
                <div class="mt-4 grid w-full gap-4">
                  <UFormField :label="t('admin.editor.sidebar.slug')">
                    <UInput v-model="form.slug" icon="i-lucide-link" />
                  </UFormField>
                  <UFormField :label="t('admin.editor.sidebar.excerpt')">
                    <UTextarea v-model="form.summary" :rows="6" />
                  </UFormField>
                </div>
              </div>

              <div class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
                <h4 class="text-sm font-semibold text-[var(--pb-text)]">{{ t('admin.editor.sidebar.template') }}</h4>
                <div class="mt-4">
                  <USelect v-model="selectedTemplate" :items="templateItems" />
                </div>
              </div>

              <div class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
                <div class="flex items-center justify-between gap-3">
                  <h4 class="text-sm font-semibold text-[var(--pb-text)]">{{ t('admin.editor.sidebar.coverImage') }}</h4>
                  <UButton v-if="form.cover_image" type="button" icon="i-lucide-x" size="xs" color="neutral" variant="ghost" @click="form.cover_image = ''">{{ t('admin.common.clear') }}</UButton>
                </div>

                <div class="mt-4 space-y-4">
                  <div v-if="form.cover_image" class="overflow-hidden rounded-[var(--pb-radius-md)] border border-[var(--pb-divider)] bg-[var(--pb-surface-subtle)]">
                    <img :src="coverPreviewUrl" :alt="t('admin.editor.sidebar.coverImageAlt')" class="h-44 w-full object-cover">
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <UButton type="button" icon="i-lucide-image-plus" size="sm" variant="soft" @click="coverPickerOpen = true">
                      {{ form.cover_image ? t('admin.editor.sidebar.replace') : t('admin.editor.sidebar.chooseCoverImage') }}
                    </UButton>
                    <UButton
                      type="button"
                      icon="i-lucide-images"
                      size="sm"
                      color="neutral"
                      variant="soft"
                      :disabled="!contentImages.length"
                      @click="showContentImages = !showContentImages"
                    >
                      {{ t('admin.editor.postSettings.chooseFromPostImages') }}
                    </UButton>
                  </div>

                  <div v-if="showContentImages" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <button
                      v-for="image in contentImages"
                      :key="image.src"
                      type="button"
                      class="overflow-hidden rounded-[var(--pb-radius-md)] border text-left transition hover:border-[var(--pb-selected-border)]"
                      :class="form.cover_image === image.src ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)]' : 'border-[var(--pb-divider)] bg-[var(--pb-surface-subtle)]'"
                      @click="selectContentImage(image.src)"
                    >
                      <img :src="image.preview" :alt="image.alt || t('admin.editor.sidebar.coverImageAlt')" class="aspect-video w-full object-cover">
                    </button>
                  </div>
                  <p v-else-if="!contentImages.length" class="text-sm text-[var(--pb-text-subtle)]">{{ t('admin.editor.postSettings.noPostImages') }}</p>
                </div>
              </div>
            </section>

            <section class="space-y-5">
            <div class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
              <h4 class="text-sm font-semibold text-[var(--pb-text)]">{{ t('admin.editor.sidebar.categories') }}</h4>
              <div class="mt-4 space-y-3">
                <div class="flex gap-2">
                  <UInput v-model="newCategoryName" size="sm" icon="i-lucide-plus" :placeholder="t('admin.editor.sidebar.addCategoryEnter')" @keydown.enter.prevent="addCategoryName" />
                  <UButton type="button" size="sm" variant="soft" color="neutral" @click="addCategoryName">{{ t('admin.common.add') }}</UButton>
                </div>
                <div v-if="form.category_names.length" class="flex flex-wrap gap-2">
                  <UBadge v-for="name in form.category_names" :key="name" color="primary" variant="subtle" class="flex items-center gap-1">
                    {{ name }}
                    <button type="button" class="inline-flex" @click="removeCategoryName(name)">
                      <UIcon name="i-lucide-x" class="size-3" />
                    </button>
                  </UBadge>
                </div>
                <label v-for="category in categories" :key="category.id" class="flex cursor-pointer items-center gap-2 text-sm text-[var(--pb-text-muted)]">
                  <input v-model="form.category_ids" type="checkbox" :value="category.id" class="rounded border-[var(--pb-border-strong)]">
                  <span>{{ category.name }}</span>
                </label>
                <p v-if="!categories.length" class="text-sm text-[var(--pb-text-subtle)]">{{ t('admin.posts.noCategoriesYet') }}</p>
              </div>
            </div>

            <div class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
              <h4 class="text-sm font-semibold text-[var(--pb-text)]">{{ t('admin.editor.sidebar.tags') }}</h4>
              <div class="mt-4 space-y-3">
                <div class="flex gap-2">
                  <UInput v-model="newTagName" size="sm" icon="i-lucide-plus" :placeholder="t('admin.editor.sidebar.addTagEnter')" @keydown.enter.prevent="addTagName" />
                  <UButton type="button" size="sm" variant="soft" color="neutral" @click="addTagName">{{ t('admin.common.add') }}</UButton>
                </div>
                <div v-if="form.tag_names.length" class="flex flex-wrap gap-2">
                  <UBadge v-for="name in form.tag_names" :key="name" color="primary" variant="subtle" class="flex items-center gap-1">
                    {{ name }}
                    <button type="button" class="inline-flex" @click="removeTagName(name)">
                      <UIcon name="i-lucide-x" class="size-3" />
                    </button>
                  </UBadge>
                </div>
                <label v-for="tag in tags" :key="tag.id" class="flex cursor-pointer items-center gap-2 text-sm text-[var(--pb-text-muted)]">
                  <input v-model="form.tag_ids" type="checkbox" :value="tag.id" class="rounded border-[var(--pb-border-strong)]">
                  <span>{{ tag.name }}</span>
                </label>
                <p v-if="!tags.length" class="text-sm text-[var(--pb-text-subtle)]">{{ t('admin.posts.noTagsYet') }}</p>
              </div>
            </div>

            <div v-if="relatedPostsEnabled" class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
              <div class="flex items-center justify-between gap-3">
                <h4 class="text-sm font-semibold text-[var(--pb-text)]">{{ t('admin.editor.postSettings.relatedPosts') }}</h4>
                <UButton type="button" icon="i-lucide-plus" size="xs" variant="soft" @click="relatedPickerOpen = true">{{ t('admin.common.add') }}</UButton>
              </div>
              <div class="mt-4 space-y-2">
                <div v-if="form.related_posts.length" class="grid gap-2">
                  <div v-for="post in form.related_posts" :key="post.id" class="flex items-center justify-between gap-3 rounded-[var(--pb-radius-md)] border border-[var(--pb-divider)] bg-[var(--pb-surface-subtle)] px-3 py-2">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-medium text-[var(--pb-text)]">{{ post.title }}</div>
                      <div class="truncate text-xs text-[var(--pb-text-subtle)]">/blog/{{ post.slug }}</div>
                    </div>
                    <UButton type="button" icon="i-lucide-x" size="xs" color="neutral" variant="ghost" :aria-label="t('admin.common.remove')" @click="removeRelatedPost(post.id)" />
                  </div>
                </div>
                <p v-else class="text-sm text-[var(--pb-text-subtle)]">{{ t('admin.editor.postSettings.noRelatedPosts') }}</p>
              </div>
            </div>

            <div class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
              <h4 class="text-sm font-semibold text-[var(--pb-text)]">{{ t('admin.editor.sidebar.visibility') }}</h4>
              <div class="mt-4 space-y-3">
                <label class="flex cursor-pointer items-start gap-3 rounded-[var(--pb-radius-md)] border p-3 text-sm" :class="visibilityClass('public')">
                  <input v-model="form.visibility" type="radio" value="public" class="mt-1">
                  <span><span class="font-medium text-[var(--pb-text)]">{{ t('admin.posts.visibility.public') }}</span><span class="block text-xs text-[var(--pb-text-subtle)]">{{ t('admin.editor.sidebar.publicDescription') }}</span></span>
                </label>
                <label class="flex cursor-pointer items-start gap-3 rounded-[var(--pb-radius-md)] border p-3 text-sm" :class="visibilityClass('private')">
                  <input v-model="form.visibility" type="radio" value="private" class="mt-1">
                  <span><span class="font-medium text-[var(--pb-text)]">{{ t('admin.posts.visibility.private') }}</span><span class="block text-xs text-[var(--pb-text-subtle)]">{{ t('admin.editor.sidebar.privateDescription') }}</span></span>
                </label>
                <label class="flex cursor-pointer items-start gap-3 rounded-[var(--pb-radius-md)] border p-3 text-sm" :class="visibilityClass('password')">
                  <input v-model="form.visibility" type="radio" value="password" class="mt-1">
                  <span class="flex-1"><span class="font-medium text-[var(--pb-text)]">{{ t('admin.posts.visibility.password') }}</span><span class="block text-xs text-[var(--pb-text-subtle)]">{{ t('admin.editor.sidebar.passwordDescription') }}</span></span>
                </label>
                <div v-if="form.visibility === 'password'" class="space-y-3 rounded-[var(--pb-radius-md)] border border-[var(--pb-divider)] bg-[var(--pb-surface-subtle)] p-3">
                  <input v-model="form.password" type="password" :placeholder="t('admin.editor.sidebar.passwordPlaceholder')" class="w-full rounded border border-[var(--pb-border-strong)] bg-[var(--pb-card-bg)] px-2 py-1 text-sm text-[var(--pb-text)]" autocomplete="new-password">
                  <input v-model="form.password_hint" type="text" :placeholder="t('admin.editor.sidebar.passwordHintPlaceholder')" class="w-full rounded border border-[var(--pb-border-strong)] bg-[var(--pb-card-bg)] px-2 py-1 text-sm text-[var(--pb-text)]">
                </div>
              </div>
            </div>
            </section>
          </div>
        </div>

        <template #footer>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton type="button" color="neutral" variant="ghost" :disabled="savingAction !== null" @click="open = false">{{ t('admin.common.cancel') }}</UButton>
            <UButton type="button" color="primary" icon="i-lucide-send" :loading="savingAction === 'publish'" :disabled="savingAction !== null" @click="emit('confirm')">
              {{ currentStatus === 'published' ? t('admin.editor.update') : t('admin.editor.publish') }}
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>

  <MediaPicker :open="coverPickerOpen" :dismissible="false" return-value="url" type-filter="image" @update:open="coverPickerOpen = $event" @select="onCoverPicked" />
  <RelatedPostPicker v-if="relatedPostsEnabled" v-model="relatedPickerOpen" @confirm="addRelatedPost" />
</template>

<script setup lang="ts">
import type { CategoryRecord, JsonContent, MediaRecord, PostStatus, PostVisibility, RelatedPostSummary, TagRecord } from '~/types/content'
import type { AdminPostEditorForm } from '~/types/editor'
import MediaPicker from '~/components/admin/media/MediaPicker.vue'
import RelatedPostPicker from '~/components/admin/editor/RelatedPostPicker.vue'

const props = defineProps<{
  open: boolean
  form: AdminPostEditorForm
  categories: CategoryRecord[]
  tags: TagRecord[]
  currentStatus: PostStatus
  currentPostId: string
  savingAction: string | null
}>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'confirm'): void
}>()

const { t } = useI18n()
const { resolveMediaUrl, toPublicMediaVariantUrl } = useMediaUrl()
const relatedPostsEnabled = __PB_BLOCK_RELATED_POST__
const coverPickerOpen = ref(false)
const relatedPickerOpen = ref(false)
const showContentImages = ref(false)
const newCategoryName = ref('')
const newTagName = ref('')
const selectedTemplate = ref('default')
const templateItems = computed(() => [{ label: t('admin.editor.sidebar.defaultTemplate'), value: 'default' }])
const nestedModalOpen = computed(() => coverPickerOpen.value || relatedPickerOpen.value)

const open = computed({
  get: () => props.open,
  set: (value) => {
    if (!value && nestedModalOpen.value) {
      return
    }
    emit('update:open', value)
  }
})
const coverPreviewUrl = computed(() => props.form.cover_image ? resolveMediaUrl(props.form.cover_image) : '')
const contentImages = computed(() => collectPostImages(props.form.content).map((image) => ({
  ...image,
  preview: toPublicMediaVariantUrl(image.src, 'thumbnail')
})))

function statusLabel(status: PostStatus) {
  return t(`admin.posts.status.${status}`)
}

function visibilityClass(value: PostVisibility) {
  return props.form.visibility === value
    ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)]'
    : 'border-[var(--pb-divider)] bg-[var(--pb-card-bg)]'
}

function onCoverPicked(files: MediaRecord[]) {
  const first = files[0]
  if (first?.url) {
    props.form.cover_image = first.url
  }
}

function selectContentImage(src: string) {
  props.form.cover_image = src
  showContentImages.value = false
}

function addRelatedPost(post: RelatedPostSummary & { target?: string, label?: string }) {
  if (!relatedPostsEnabled || isCurrentPost(post) || hasRelatedPost(post)) {
    return
  }

  props.form.related_post_ids.push(post.id)
  props.form.related_posts.push({ id: post.id, slug: post.slug, title: post.title })
}

function removeRelatedPost(postId: string) {
  props.form.related_post_ids = props.form.related_post_ids.filter(id => id !== postId)
  props.form.related_posts = props.form.related_posts.filter(post => post.id !== postId)
}

function isCurrentPost(post: RelatedPostSummary) {
  return post.id === props.currentPostId || post.slug === props.form.slug
}

function hasRelatedPost(post: RelatedPostSummary) {
  return props.form.related_post_ids.includes(post.id) || props.form.related_posts.some(item => item.slug === post.slug)
}

function addCategoryName() {
  const value = newCategoryName.value.trim()
  if (!value) return
  if (!containsName(props.form.category_names, value)) {
    props.form.category_names.push(value)
  }
  newCategoryName.value = ''
}

function removeCategoryName(name: string) {
  props.form.category_names = props.form.category_names.filter(item => item !== name)
}

function addTagName() {
  const value = newTagName.value.trim()
  if (!value) return
  if (!containsName(props.form.tag_names, value)) {
    props.form.tag_names.push(value)
  }
  newTagName.value = ''
}

function removeTagName(name: string) {
  props.form.tag_names = props.form.tag_names.filter(item => item !== name)
}

function containsName(values: string[], target: string) {
  const normalizedTarget = target.toLowerCase()
  return values.some(value => value.toLowerCase() === normalizedTarget)
}

function collectPostImages(root: JsonContent | null | undefined) {
  const images: Array<{ src: string, alt: string }> = []
  const seen = new Set<string>()
  collectImageNodes(root, images, seen)
  return images
}

function collectImageNodes(node: JsonContent | null | undefined, images: Array<{ src: string, alt: string }>, seen: Set<string>) {
  if (!node) return
  if (node.type === 'image') {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src.trim() : ''
    if (src && !seen.has(src)) {
      seen.add(src)
      images.push({ src, alt: typeof node.attrs?.alt === 'string' ? node.attrs.alt : '' })
    }
  }
  node.content?.forEach(child => collectImageNodes(child, images, seen))
}
</script>
