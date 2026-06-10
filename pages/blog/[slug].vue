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

    <div class="post-shell mx-auto grid gap-8">
      <article v-if="post && !error && !isLocked(post)" class="theme-scope grid gap-8">
        <figure v-if="post.cover_image" class="post-hero overflow-hidden rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-hero-bg)] shadow-[var(--pb-shadow-md)]">
          <img
            :src="post.cover_image"
            :alt="post.title"
            class="h-full w-full object-cover"
          >
        </figure>

        <div class="post-reading-frame mx-auto w-full rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] p-6 shadow-[var(--pb-shadow-sm)] md:p-8">
          <header class="mb-8 border-b border-[var(--pb-divider)] pb-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--pb-text-subtle)]">
                <time v-if="post.published_at" :datetime="post.published_at">
                  {{ formatDate(post.published_at) }}
                </time>
                <span class="inline-flex items-center gap-1.5">
                  <UIcon name="i-lucide-eye" class="size-4 text-[var(--pb-icon-muted)]" />
                  {{ formatViews(post.view_count) }}
                </span>
                <span v-if="contentLengthLabel(post)" class="inline-flex items-center gap-1.5">
                  <UIcon name="i-lucide-file-text" class="size-4 text-[var(--pb-icon-muted)]" />
                  {{ contentLengthLabel(post) }}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <UButton v-if="isLoggedIn" :to="editLink" variant="soft" color="neutral" icon="i-lucide-pencil" size="xs">
                  {{ t('public.post.edit') }}
                </UButton>
                <UButton to="/" variant="ghost" color="neutral" icon="i-lucide-arrow-left" size="xs">
                  {{ t('public.post.back') }}
                </UButton>
              </div>
            </div>
            <h1 class="mt-5 font-[var(--pb-font-display)] text-4xl font-semibold leading-[1.14] tracking-normal text-[var(--pb-text)] md:text-5xl lg:text-[3.5rem]">{{ post.title }}</h1>
            <p v-if="post.summary" class="mt-4 text-lg leading-relaxed text-[var(--pb-text-muted)] md:text-xl">{{ post.summary }}</p>
          </header>

          <div class="blog-content">
            <ContentRenderer :node="post.content_json" />
            <ContentFootnotesSection :content="post.content_json" />
          </div>
        </div>
      </article>

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
const { t, locale } = useI18n()
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
  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function formatViews(value: number) {
  const count = Math.max(0, Number(value) || 0)
  return `${new Intl.NumberFormat(locale.value).format(count)} ${t(count === 1 ? 'public.post.view' : 'public.post.views')}`
}

function contentLengthLabel(value: PostRecord) {
  const words = Number(value.word_count ?? 0)
  const cjk = Number(value.cjk_char_count ?? 0)
  if (!words && !cjk) return ''
  const formatter = new Intl.NumberFormat(locale.value)
  const parts: string[] = []
  if (cjk) parts.push(`${formatter.format(cjk)} ${t('public.post.chars')}`)
  if (words) parts.push(`${formatter.format(words)} ${t('public.post.words')}`)
  return parts.join(' · ')
}

function isLocked(value: PostRecord | PostLockedResponse): value is PostLockedResponse {
  return (value as PostLockedResponse).locked === true
}
</script>

<style scoped>
.post-shell {
  max-width: min(100%, var(--pb-layout-content-max));
}

.post-hero {
  aspect-ratio: 16 / 7;
  min-height: 18rem;
  max-height: 36rem;
}

.post-reading-frame {
  width: clamp(min(100%, var(--pb-post-content-min-width)), 100%, var(--pb-post-content-fluid-width));
  max-width: var(--pb-post-content-max-width);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--pb-card-bg) 90%, var(--pb-selected-bg)),
    color-mix(in srgb, var(--pb-card-bg) 96%, var(--pb-selected-bg))
  );
}
</style>
