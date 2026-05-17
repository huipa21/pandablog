<template>
  <section class="grid gap-6">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <UButton to="/admin/posts" variant="ghost" color="neutral" icon="i-lucide-arrow-left" class="mb-3">
          Posts
        </UButton>
        <h1 class="text-3xl font-semibold tracking-normal text-stone-950">Edit post</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton icon="i-lucide-save" variant="soft" :loading="saving" @click="save(form.status)">
          Save
        </UButton>
        <UButton icon="i-lucide-send" color="primary" :loading="saving" @click="save('published')">
          Publish
        </UButton>
        <UButton icon="i-lucide-archive" color="error" variant="ghost" :loading="archiving" @click="archivePost">
          Archive
        </UButton>
      </div>
    </div>

    <UAlert v-if="loadError" color="error" icon="i-lucide-circle-alert" title="Could not load this post" />
    <UAlert v-if="notice" color="success" icon="i-lucide-check" :title="notice" />

    <div v-if="pending" class="grid gap-4">
      <USkeleton class="h-12" />
      <USkeleton class="h-32" />
      <USkeleton class="h-80" />
    </div>

    <form v-else class="grid gap-5 rounded-lg border border-stone-200 bg-white p-5 shadow-sm" @submit.prevent="save(form.status)">
      <div class="grid gap-5 md:grid-cols-[1fr_220px]">
        <UFormField label="Title" name="title" required>
          <UInput v-model="form.title" size="xl" />
        </UFormField>
        <UFormField label="Status" name="status">
          <USelect v-model="form.status" :items="statusItems" />
        </UFormField>
      </div>

      <UFormField label="Slug" name="slug">
        <UInput v-model="form.slug" icon="i-lucide-link" />
      </UFormField>

      <UFormField label="Summary" name="summary">
        <UTextarea v-model="form.summary" :rows="3" />
      </UFormField>

      <UFormField label="Body" name="body">
        <TiptapEditor v-model="form.content" />
      </UFormField>
    </form>
  </section>
</template>

<script setup lang="ts">
import type { JsonContent, PostRecord, PostStatus } from '~/types/content'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const apiPath = computed(() => `/api/admin/posts/${encodeURIComponent(id.value)}`)
const saving = ref(false)
const archiving = ref(false)
const notice = ref('')
const statusItems = [
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' }
]
const form = reactive({
  title: '',
  slug: '',
  summary: '',
  status: 'draft' as PostStatus,
  content: emptyDoc()
})

const { data: post, pending, error: loadError } = await useAsyncData(`admin-post-${id.value}`, () => $fetch<PostRecord>(apiPath.value))

watch(post, (value) => {
  if (!value) {
    return
  }

  form.title = value.title
  form.slug = value.slug
  form.summary = value.summary ?? ''
  form.status = value.status === 'archived' ? 'draft' : value.status
  form.content = value.content_json
}, { immediate: true })

async function save(nextStatus: PostStatus) {
  saving.value = true
  notice.value = ''

  try {
    const saved = await $fetch<PostRecord>(apiPath.value, {
      method: 'PUT',
      body: {
        title: form.title,
        slug: form.slug,
        summary: form.summary,
        status: nextStatus,
        content_json: form.content
      }
    })

    form.slug = saved.slug
    form.status = saved.status
    notice.value = nextStatus === 'published' ? 'Published' : 'Saved'
  } finally {
    saving.value = false
  }
}

async function archivePost() {
  archiving.value = true
  try {
    await $fetch(apiPath.value, { method: 'DELETE' })
    await navigateTo('/admin/posts')
  } finally {
    archiving.value = false
  }
}

function emptyDoc(): JsonContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [] }]
  }
}
</script>