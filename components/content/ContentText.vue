<template>
  <template v-if="!currentMark">{{ text }}</template>
  <strong v-else-if="currentMark.type === 'bold'">
    <ContentText :text="text" :marks="remainingMarks" />
  </strong>
  <em v-else-if="currentMark.type === 'italic'">
    <ContentText :text="text" :marks="remainingMarks" />
  </em>
  <s v-else-if="currentMark.type === 'strike'">
    <ContentText :text="text" :marks="remainingMarks" />
  </s>
  <code v-else-if="currentMark.type === 'code'">
    <ContentText :text="text" :marks="remainingMarks" />
  </code>
  <sub v-else-if="currentMark.type === 'subscript'">
    <ContentText :text="text" :marks="remainingMarks" />
  </sub>
  <sup v-else-if="currentMark.type === 'superscript'">
    <ContentText :text="text" :marks="remainingMarks" />
  </sup>
  <sup
    v-else-if="currentMark.type === 'footnote'"
    :id="`fnref-${footnoteId}`"
    class="footnote-ref"
    :data-footnote-id="footnoteId"
    :data-footnote-index="footnoteIndex"
  >
    <a :href="`#fn-${footnoteId}`">
      {{ footnoteIndex }}
    </a>
  </sup>
  <a
    v-else-if="currentMark.type === 'link'"
    :href="href"
    :target="linkTarget"
    :rel="linkRel"
    :data-open-mode="openMode === 'same-tab' ? undefined : openMode"
    class="content-link"
    @click="handleLinkClick"
  >
    <ContentText :text="text" :marks="remainingMarks" />
  </a>
  <span v-else-if="currentMark.type === 'textStyle'" :style="markStyle">
    <ContentText :text="text" :marks="remainingMarks" />
  </span>
  <mark v-else-if="currentMark.type === 'highlight'" class="content-highlight" :style="markStyle">
    <ContentText :text="text" :marks="remainingMarks" />
  </mark>
  <span v-else-if="currentMark.type === 'diffHighlight'" class="content-diff-highlight" :class="`is-${diffStatus}`">
    <ContentText :text="text" :marks="remainingMarks" />
  </span>
  <ContentText v-else :text="text" :marks="remainingMarks" />
</template>

<script setup lang="ts">
import { highlightCssVars, normalizeHighlightColor } from '~/utils/highlightColors'

const props = defineProps<{
  text: string
  marks?: Array<{
    type: string
    attrs?: Record<string, unknown>
  }>
}>()

const currentMark = computed(() => props.marks?.[0])
const remainingMarks = computed(() => props.marks?.slice(1) ?? [])
const diffStatus = computed(() => {
  const status = currentMark.value?.attrs?.status
  return status === 'added' || status === 'removed' || status === 'changed' ? status : 'changed'
})
const href = computed(() => {
  const raw = currentMark.value?.attrs?.href
  if (typeof raw !== 'string') {
    return '#'
  }

  if (raw.startsWith('#') || raw.startsWith('/') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('mailto:')) {
    return raw
  }

  return '#'
})

const openMode = computed(() => {
  const mode = currentMark.value?.attrs?.openMode
  if (mode === 'new-window' || mode === 'new-tab' || mode === 'same-tab') {
    return mode
  }

  return currentMark.value?.attrs?.target === '_blank' ? 'new-tab' : 'same-tab'
})

const linkTarget = computed(() => openMode.value === 'same-tab' ? undefined : '_blank')
const linkRel = computed(() => openMode.value === 'same-tab' ? 'noopener noreferrer nofollow' : 'noopener noreferrer')

const markStyle = computed(() => {
  const style: Record<string, string> = {}
  const attrs = currentMark.value?.attrs ?? {}

  if (currentMark.value?.type === 'textStyle') {
    const color = safeCssValue(attrs.color)
    const fontFamily = safeCssValue(attrs.fontFamily)

    if (color) {
      style.color = color
    }

    if (fontFamily) {
      style.fontFamily = fontFamily
    }
  }

  if (currentMark.value?.type === 'highlight') {
    const seed = normalizeHighlightColor(safeCssValue(attrs.color) || attrs.color)
    Object.assign(style, highlightCssVars(seed))
  }

  return style
})

const footnoteIndex = computed(() => {
  const n = Number(currentMark.value?.attrs?.index ?? props.text)
  return Number.isFinite(n) ? String(n) : String(props.text)
})

const footnoteId = computed(() => {
  const id = currentMark.value?.attrs?.id
  return typeof id === 'string' && id.trim() ? id.trim() : footnoteIndex.value
})

function safeCssValue(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  return /^[#a-zA-Z0-9(),.%\s-]+$/.test(value) ? value : ''
}

function handleLinkClick(event: MouseEvent) {
  if (openMode.value !== 'new-window') {
    return
  }

  if (!import.meta.client || href.value === '#' || href.value.startsWith('#')) {
    return
  }

  event.preventDefault()
  window.open(href.value, '_blank', 'popup=yes,width=1100,height=760,noopener,noreferrer')
}
</script>

<style scoped>
/* Visual highlight styling (background, text, padding, radius) lives in the
   shared .pb-prose mark rules in assets/css/main.css so the editor and public
   post render identically. */

/* Draft-comparison only: highlights just the changed text/parts inside a block
   with a subtle protruding effect. Never present in published content. */
.content-diff-highlight {
  border-radius: 0.3em;
  padding: 0.02em 0.2em;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.content-diff-highlight.is-added {
  background: color-mix(in srgb, var(--pb-success, #16a34a) 26%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--pb-success, #16a34a) 55%, transparent),
    0 2px 6px -1px color-mix(in srgb, var(--pb-success, #16a34a) 45%, transparent);
}

.content-diff-highlight.is-removed {
  background: color-mix(in srgb, var(--pb-danger, #dc2626) 26%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--pb-danger, #dc2626) 55%, transparent),
    0 2px 6px -1px color-mix(in srgb, var(--pb-danger, #dc2626) 45%, transparent);
}

.content-diff-highlight.is-changed {
  background: color-mix(in srgb, var(--pb-warning, #d97706) 30%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--pb-warning, #d97706) 60%, transparent),
    0 2px 6px -1px color-mix(in srgb, var(--pb-warning, #d97706) 48%, transparent);
}
</style>