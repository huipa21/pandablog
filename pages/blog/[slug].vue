<template>
  <NuxtLayout name="default">
    <template #sidebar>
      <template v-if="post && !isLocked(post)">
        <BlogPostToc :content-json="post.content_json" />
        <BlogCategoryList />
        <BlogTagCloud />
        <BlogKnowledgeGraph />
        <BlogRelatedPosts :current-slug="post.slug" />
      </template>
      <template v-else>
        <BlogOwnerBio />
        <BlogCategoryList />
        <BlogTagCloud />
      </template>
    </template>

    <div class="pb-content-frame mx-auto">
      <article v-if="post && !error && !isLocked(post)" class="theme-scope overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <img
          v-if="post.cover_image"
          :src="post.cover_image"
          :alt="post.title"
          class="h-64 w-full object-cover"
        >
        <div class="p-6 md:p-8">
          <header class="mb-8 border-b border-stone-200 pb-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-500">
                <time v-if="post.published_at" :datetime="post.published_at">
                  {{ formatDate(post.published_at) }}
                </time>
                <span class="inline-flex items-center gap-1.5">
                  <UIcon name="i-lucide-eye" class="size-4" />
                  {{ formatViews(post.view_count) }}
                </span>
                <span v-if="contentLengthLabel(post)" class="inline-flex items-center gap-1.5">
                  <UIcon name="i-lucide-file-text" class="size-4" />
                  {{ contentLengthLabel(post) }}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <UButton v-if="isLoggedIn" :to="editLink" variant="soft" color="neutral" icon="i-lucide-pencil" size="xs">
                  Edit
                </UButton>
                <UButton to="/" variant="ghost" color="neutral" icon="i-lucide-arrow-left" size="xs">
                  Back
                </UButton>
              </div>
            </div>
            <h1 class="mt-2 text-3xl font-bold tracking-normal text-stone-950 md:text-4xl">{{ post.title }}</h1>
            <p v-if="post.summary" class="mt-3 text-lg leading-relaxed text-stone-600">{{ post.summary }}</p>
          </header>

          <div class="blog-content">
            <ContentRenderer :node="post.content_json" />
            <ContentFootnotesSection :content="post.content_json" />
          </div>
        </div>
      </article>

      <template v-else>
        <UButton to="/" variant="ghost" color="neutral" icon="i-lucide-arrow-left" class="mb-4 -ml-2">
          Back
        </UButton>

        <UAlert
          v-if="error"
          color="error"
          icon="i-lucide-circle-alert"
          :title="isSitePrivateError ? 'Site is private' : 'Post not found'"
          :description="isSitePrivateError ? 'This blog is currently private. Sign in as admin to continue.' : undefined"
        />

        <PostPasswordGate
          v-else-if="post && isLocked(post)"
          :slug="post.slug"
          :title="post.title"
          :hint="post.passwordHint"
        />
      </template>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { PostLockedResponse, PostRecord } from '~/types/content'

definePageMeta({ layout: false })

const route = useRoute()
const slug = computed(() => String(route.params.slug))

type PublicFetch = <T>(url: string) => Promise<T>

const fetchWithSession: PublicFetch = (url) => {
  if (import.meta.server) {
    const requestFetch = useRequestFetch() as unknown as PublicFetch
    return requestFetch(url)
  }

  const clientFetch = $fetch as unknown as PublicFetch
  return clientFetch(url)
}

const { data: post, error } = await useAsyncData(`post-${slug.value}`, () => fetchWithSession<PostRecord | PostLockedResponse>(`/api/posts/${slug.value}`))
const { data: authSession } = await usePublicAuthSession()
const isLoggedIn = computed(() => Boolean(authSession.value?.loggedIn))
const editLink = computed(() => {
  const value = post.value
  if (!value || isLocked(value)) {
    return '/admin/posts'
  }

  return `/admin/posts/${encodeURIComponent(value.id)}`
})

const isSitePrivateError = computed(() => {
  const err = error.value as {
    statusCode?: number
    status?: number
    statusMessage?: string
    message?: string
    data?: { message?: string }
  } | null | undefined

  const statusCode = Number(err?.statusCode ?? err?.status ?? 0)
  const message = String(err?.statusMessage ?? err?.data?.message ?? err?.message ?? '').toLowerCase()
  return statusCode === 401 && message.includes('site is private')
})

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function formatViews(value: number) {
  const count = Math.max(0, Number(value) || 0)
  return `${new Intl.NumberFormat('en').format(count)} ${count === 1 ? 'view' : 'views'}`
}

function contentLengthLabel(value: PostRecord) {
  const words = Number(value.word_count ?? 0)
  const cjk = Number(value.cjk_char_count ?? 0)
  if (!words && !cjk) return ''
  const formatter = new Intl.NumberFormat('en')
  const parts: string[] = []
  if (cjk) parts.push(`${formatter.format(cjk)} chars`)
  if (words) parts.push(`${formatter.format(words)} words`)
  return parts.join(' · ')
}

function isLocked(value: PostRecord | PostLockedResponse): value is PostLockedResponse {
  return (value as PostLockedResponse).locked === true
}
</script>

<style scoped>
.pb-content-frame {
  max-width: var(--pb-post-content-max-width);
}
</style>