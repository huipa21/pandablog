<template>
  <NuxtLayout name="default">
    <template #sidebar>
      <template v-if="post && !isLocked(post)">
        <BlogPostToc :content-json="post.content_json" />
        <BlogRelatedPosts :current-slug="post.slug" />
        <BlogKnowledgeGraph />
      </template>
      <template v-else>
        <BlogOwnerBio />
        <BlogTagCloud />
        <BlogCategoryList />
      </template>
    </template>

    <div class="pb-content-frame mx-auto">
      <UButton to="/" variant="ghost" color="neutral" icon="i-lucide-arrow-left" class="mb-6">
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

      <article v-else-if="post" class="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <img
          v-if="post.cover_image"
          :src="post.cover_image"
          :alt="post.title"
          class="h-64 w-full object-cover"
        >
        <div class="p-6 md:p-8">
          <header class="mb-8 border-b border-stone-200 pb-6">
            <time v-if="post.published_at" :datetime="post.published_at" class="text-sm text-stone-500">
              {{ formatDate(post.published_at) }}
            </time>
            <h1 class="mt-2 text-3xl font-bold tracking-normal text-stone-950 md:text-4xl">{{ post.title }}</h1>
            <p v-if="post.summary" class="mt-3 text-lg leading-relaxed text-stone-600">{{ post.summary }}</p>
          </header>

          <div class="prose prose-stone max-w-none">
            <ContentRenderer :node="post.content_json" />
            <ContentFootnotesSection :content="post.content_json" />
          </div>
        </div>
      </article>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { PostLockedResponse, PostRecord } from '~/types/content'

definePageMeta({ layout: false })

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data: post, error } = await useAsyncData(`post-${slug.value}`, () => $fetch<PostRecord | PostLockedResponse>(`/api/posts/${slug.value}`))

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

function isLocked(value: PostRecord | PostLockedResponse): value is PostLockedResponse {
  return (value as PostLockedResponse).locked === true
}
</script>

<style scoped>
.pb-content-frame {
  max-width: var(--pb-post-content-max-width);
}
</style>