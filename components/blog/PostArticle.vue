<template>
  <article class="theme-scope grid min-w-0 gap-8">
    <template v-if="isPublic">
      <BlogReadingProgressBar :progress="progress" />
      <BlogResumeReadingPrompt :visible="promptVisible" @resume="resume" @close="dismiss" />
    </template>
    <div
      class="post-reading-frame mx-auto w-full min-w-0 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] p-4 shadow-[var(--pb-shadow-sm)] sm:p-6 md:p-8 min-h-[calc(100vh-12rem)]"
      :data-reader-font-size="isPublic ? readerPrefs.fontSize : null"
      :data-reader-font-family="isPublic ? readerPrefs.fontFamily : null"
      :data-reader-appearance="isPublic ? readerPrefs.appearance : null"
      :data-reader-line-width="isPublic ? readerPrefs.lineWidth : null"
    >
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
              <span v-if="readingTime" class="inline-flex items-center gap-1.5" data-testid="post-reading-time">
                <UIcon name="i-lucide-clock" class="size-4 text-[var(--pb-icon-muted)]" />
                {{ readingTime }}
              </span>
            </template>
            <span v-else class="inline-flex items-center gap-1.5">
              <UIcon name="i-lucide-eye" class="size-4 text-[var(--pb-icon-muted)]" />
              {{ t('admin.editor.preview.badge') }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <template v-if="variant === 'public'">
              <BlogReaderSettingsMenu />
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

      <div ref="contentEl" class="blog-content">
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

const isPublic = computed(() => props.variant === 'public')
const contentEl = ref<HTMLElement | null>(null)
const { progress } = useReadingProgress(contentEl, isPublic)
const { prefs: readerPrefs } = useReaderPrefs()
const { promptVisible, resume, dismiss } = useReadingPosition({
  slug: () => props.post.slug,
  updatedAt: () => props.post.updated_at,
  contentEl,
  enabled: isPublic
})

const readingTimeLabel = useReadingTimeLabel()
const readingTime = computed(() => readingTimeLabel(props.post))

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
  max-width: var(--pb-reader-line-width, var(--pb-post-content-max-width));
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

/*
 * Reader mode overrides. `useReaderPrefs` writes the chosen value as a
 * `data-reader-*` attribute on `.post-reading-frame`; defaults (`md`/`sans`/
 * `auto`/`normal`) are already the site's normal look, so visitors who never
 * open the panel see no change at all.
 */
.post-reading-frame[data-reader-font-size="sm"] { --pb-reader-font-scale: 0.9; }
.post-reading-frame[data-reader-font-size="lg"] { --pb-reader-font-scale: 1.15; }
.post-reading-frame[data-reader-font-size="xl"] { --pb-reader-font-scale: 1.3; }

.post-reading-frame[data-reader-font-family="serif"] {
  --pb-reader-font-family: var(--pb-reader-serif-stack);
}

.post-reading-frame[data-reader-line-width="narrow"] { --pb-reader-line-width: min(100%, 42rem); }
.post-reading-frame[data-reader-line-width="wide"] { --pb-reader-line-width: min(100%, var(--pb-post-content-cap-width)); }

/* Appearance overrides use their own fixed palette (not the active site
   theme's tokens), so Light/Sepia/Dark read the same regardless of which
   theme or site-wide mode is active. Re-assigning the shared --pb-* tokens
   (rather than hardcoding colors on every descendant) lets prose, links,
   tags, dividers and inline code already built on those tokens pick the
   override up for free. */
.post-reading-frame[data-reader-appearance="light"] {
  --pb-card-bg: var(--pb-reader-light-card-bg);
  --pb-surface-subtle: var(--pb-reader-light-surface-subtle);
  --pb-text: var(--pb-reader-light-text);
  --pb-text-muted: var(--pb-reader-light-text-muted);
  --pb-text-subtle: var(--pb-reader-light-text-subtle);
  --pb-divider: var(--pb-reader-light-divider);
  --pb-card-border: var(--pb-reader-light-divider);
  --pb-link: var(--pb-reader-light-link);
  --pb-link-hover: var(--pb-reader-light-link-hover);
  --pb-primary: var(--pb-reader-light-link);
  --pb-icon-muted: var(--pb-reader-light-icon-muted);
  --pb-inline-code-bg: var(--pb-reader-light-code-bg);
  --pb-inline-code-border: var(--pb-reader-light-code-border);
  --pb-inline-code-color: var(--pb-reader-light-code-color);
  --pb-selected-bg: var(--pb-reader-light-selected-bg);
  --pb-selected-border: var(--pb-reader-light-link);
}

.post-reading-frame[data-reader-appearance="sepia"] {
  --pb-card-bg: var(--pb-reader-sepia-card-bg);
  --pb-surface-subtle: var(--pb-reader-sepia-surface-subtle);
  --pb-text: var(--pb-reader-sepia-text);
  --pb-text-muted: var(--pb-reader-sepia-text-muted);
  --pb-text-subtle: var(--pb-reader-sepia-text-subtle);
  --pb-divider: var(--pb-reader-sepia-divider);
  --pb-card-border: var(--pb-reader-sepia-divider);
  --pb-link: var(--pb-reader-sepia-link);
  --pb-link-hover: var(--pb-reader-sepia-link-hover);
  --pb-primary: var(--pb-reader-sepia-link);
  --pb-icon-muted: var(--pb-reader-sepia-icon-muted);
  --pb-inline-code-bg: var(--pb-reader-sepia-code-bg);
  --pb-inline-code-border: var(--pb-reader-sepia-code-border);
  --pb-inline-code-color: var(--pb-reader-sepia-code-color);
  --pb-selected-bg: var(--pb-reader-sepia-selected-bg);
  --pb-selected-border: var(--pb-reader-sepia-selected-border);
}

.post-reading-frame[data-reader-appearance="dark"] {
  --pb-card-bg: var(--pb-reader-dark-card-bg);
  --pb-surface-subtle: var(--pb-reader-dark-surface-subtle);
  --pb-text: var(--pb-reader-dark-text);
  --pb-text-muted: var(--pb-reader-dark-text-muted);
  --pb-text-subtle: var(--pb-reader-dark-text-subtle);
  --pb-divider: var(--pb-reader-dark-divider);
  --pb-card-border: var(--pb-reader-dark-divider);
  --pb-link: var(--pb-reader-dark-link);
  --pb-link-hover: var(--pb-reader-dark-link-hover);
  --pb-primary: var(--pb-reader-dark-link);
  --pb-icon-muted: var(--pb-reader-dark-icon-muted);
  --pb-inline-code-bg: var(--pb-reader-dark-code-bg);
  --pb-inline-code-border: var(--pb-reader-dark-code-border);
  --pb-inline-code-color: var(--pb-reader-dark-code-color);
  --pb-selected-bg: var(--pb-reader-dark-selected-bg);
  --pb-selected-border: var(--pb-reader-dark-selected-border);
}
</style>
