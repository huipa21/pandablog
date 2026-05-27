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
  <sup v-else-if="currentMark.type === 'footnote'" class="footnote-ref">
    <a :href="`#fn-${currentMark.attrs?.id}`" :id="`fnref-${currentMark.attrs?.id}`">
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
  <span v-else-if="currentMark.type === 'textStyle' || currentMark.type === 'highlight'" :style="markStyle">
    <ContentText :text="text" :marks="remainingMarks" />
  </span>
  <ContentText v-else :text="text" :marks="remainingMarks" />
</template>

<script setup lang="ts">
const props = defineProps<{
  text: string
  marks?: Array<{
    type: string
    attrs?: Record<string, unknown>
  }>
}>()

const currentMark = computed(() => props.marks?.[0])
const remainingMarks = computed(() => props.marks?.slice(1) ?? [])
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
    const color = safeCssValue(attrs.color)
    if (color) {
      style.backgroundColor = color
    }
  }

  return style
})

const footnoteIndex = computed(() => {
  const n = Number(currentMark.value?.attrs?.index ?? props.text)
  return Number.isFinite(n) ? String(n) : String(props.text)
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