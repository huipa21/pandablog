<template>
  <article class="theme-scope grid min-w-0 gap-8">
    <div class="post-reading-frame mx-auto w-full min-w-0 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] p-4 shadow-[var(--pb-shadow-sm)] sm:p-6 md:p-8 min-h-[calc(100vh-12rem)]">
      <header class="mb-8 border-b border-[var(--pb-divider)] pb-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--pb-text-subtle)]">
            <template v-if="variant === 'public'">
              <time v-if="post.published_at" :datetime="post.published_at">
                {{ formatDate(post.published_at) }}
              </time>
              <span class="inline-flex items-center gap-1.5">
                <UIcon name="i-lucide-eye" class="size-4 text-[var(--pb-icon-muted)]" />
                {{ formatViews(post.view_count) }}
              </span>
              <span v-if="contentLengthLabel" class="inline-flex items-center gap-1.5">
                <UIcon name="i-lucide-file-text" class="size-4 text-[var(--pb-icon-muted)]" />
                {{ contentLengthLabel }}
              </span>
            </template>
            <span v-else class="inline-flex items-center gap-1.5">
              <UIcon name="i-lucide-eye" class="size-4 text-[var(--pb-icon-muted)]" />
              {{ t('admin.editor.preview.badge') }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <template v-if="variant === 'public'">
              <UButton v-if="isLoggedIn" :to="editLink" variant="soft" color="neutral" icon="i-lucide-pencil" size="xs">
                {{ t('public.post.edit') }}
              </UButton>
              <UButton to="/" variant="ghost" color="neutral" icon="i-lucide-arrow-left" size="xs">
                {{ t('public.post.back') }}
              </UButton>
            </template>
            <UButton v-else :to="editLink" variant="ghost" color="neutral" icon="i-lucide-arrow-left" size="xs">
              {{ t('admin.editor.preview.backToEditor') }}
            </UButton>
          </div>
        </div>
        <h1 class="mt-5 font-[var(--pb-font-display)] text-4xl font-semibold leading-[1.14] tracking-normal text-[var(--pb-text)] md:text-5xl lg:text-[3.5rem]">{{ post.title }}</h1>
        <p v-if="post.summary" class="mt-4 text-lg leading-relaxed text-[var(--pb-text-muted)] md:text-xl">{{ post.summary }}</p>
        <div v-if="post.tags?.length" class="mt-5 flex flex-wrap gap-2">
          <NuxtLink
            v-for="tag in post.tags"
            :key="tag.slug"
            :to="`/tag/${tag.slug}`"
            class="inline-flex items-center rounded-[var(--pb-radius-sm)] border border-[var(--pb-divider)] bg-[var(--pb-surface-subtle)] px-3 py-1 text-sm font-medium text-[var(--pb-text-muted)] transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)] hover:text-[var(--pb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb-selected-border)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pb-card-bg)]"
          >
            #{{ tag.name }}
          </NuxtLink>
        </div>
      </header>

      <div class="blog-content">
        <ContentRenderer :node="post.content_json" />
        <ContentFootnotesSection :content="post.content_json" />
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { PostRecord } from '~/types/content'

const props = withDefaults(defineProps<{
  post: PostRecord
  variant?: 'public' | 'preview'
  isLoggedIn?: boolean
  editLink?: string
}>(), {
  variant: 'public',
  isLoggedIn: false,
  editLink: '/admin/posts'
})

const { t, locale } = useI18n()

const contentLengthLabel = computed(() => {
  const words = Number(props.post.word_count ?? 0)
  const cjk = Number(props.post.cjk_char_count ?? 0)
  if (!words && !cjk) return ''
  const formatter = new Intl.NumberFormat(locale.value)
  const parts: string[] = []
  if (cjk) parts.push(`${formatter.format(cjk)} ${t('public.post.chars')}`)
  if (words) parts.push(`${formatter.format(words)} ${t('public.post.words')}`)
  return parts.join(' · ')
})

function formatDate(value: string) {
  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function formatViews(value: number) {
  const count = Math.max(0, Number(value) || 0)
  return `${new Intl.NumberFormat(locale.value).format(count)} ${t(count === 1 ? 'public.post.view' : 'public.post.views')}`
}
</script>

<style scoped>
.post-reading-frame {
  width: 100%;
  min-width: 0;
  max-width: var(--pb-post-content-max-width);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--pb-card-bg) 90%, var(--pb-selected-bg)),
    color-mix(in srgb, var(--pb-card-bg) 96%, var(--pb-selected-bg))
  );
}

@media (max-width: 767px) {
  .post-reading-frame {
    width: calc(100% + 2.5rem);
    max-width: none;
    margin-inline: -1.25rem;
    border-inline: 0;
    border-radius: 0;
  }
}
</style>