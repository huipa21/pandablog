<template>
  <NuxtLayout name="default">
    <template #sidebar>
      <template v-if="post && !isLocked(post)">
        <BlogPostToc :content-json="post.content_json" />
        <BlogCategoryList />
        <BlogTagCloud />
        <BlogKnowledgeGraph v-if="graphEnabled" :current-slug="post.slug" />
        <BlogRelatedPosts :current-slug="post.slug" />
      </template>
      <template v-else>
        <BlogOwnerBio />
        <BlogCategoryList />
        <BlogTagCloud />
      </template>
    </template>

    <div class="post-shell mx-auto grid min-w-0 gap-8">
      <BlogPostArticle v-if="post && !error && !isLocked(post)" :post="post" :is-logged-in="isLoggedIn" :edit-link="editLink" />

      <template v-else>
        <UButton to="/" variant="ghost" color="neutral" icon="i-lucide-arrow-left" class="mb-4 -ml-2">
          {{ t('public.post.back') }}
        </UButton>

        <UAlert
          v-if="error"
          color="error"
          icon="i-lucide-circle-alert"
          :title="isSitePrivateError ? t('public.post.sitePrivateTitle') : t('public.post.notFound')"
          :description="isSitePrivateError ? t('public.post.sitePrivateDescription') : undefined"
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
const { t } = useI18n()
const slug = computed(() => String(route.params.slug))
const graphEnabled = __PB_MODULE_GRAPH_VIEW__

type PublicFetch = <T>(url: string) => Promise<T>

const fetchWithSession: PublicFetch = (url) => {
  if (import.meta.server) {
    const requestFetch = useRequestFetch() as unknown as PublicFetch
    return requestFetch(url)
  }

  const clientFetch = $fetch as unknown as PublicFetch
  return clientFetch(url)
}

const { data: post, error } = await useAsyncData(
  `post-${slug.value}`,
  () => fetchWithSession<PostRecord | PostLockedResponse>(`/api/posts/${encodeURIComponent(slug.value)}`),
  {
    deep: false,
    transform: markPostContentRaw
  }
)
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

function isLocked(value: PostRecord | PostLockedResponse): value is PostLockedResponse {
  return (value as PostLockedResponse).locked === true
}

function markPostContentRaw(value: PostRecord | PostLockedResponse) {
  if (isLocked(value)) {
    return value
  }

  return {
    ...value,
    content_json: markRaw(value.content_json)
  }
}
</script>

<style scoped>
.post-shell {
  width: 100%;
  max-width: min(100%, var(--pb-layout-content-max));
}

@media (max-width: 767px) {
  .post-shell {
    max-width: none;
  }
}
</style>
