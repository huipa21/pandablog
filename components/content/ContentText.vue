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
  <NuxtLink v-else-if="currentMark.type === 'link'" :to="href">
    <ContentText :text="text" :marks="remainingMarks" />
  </NuxtLink>
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

  if (raw.startsWith('/') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('mailto:')) {
    return raw
  }

  return '#'
})

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

function safeCssValue(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  return /^[#a-zA-Z0-9(),.%\s-]+$/.test(value) ? value : ''
}
</script>