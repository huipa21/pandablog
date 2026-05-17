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
</script>