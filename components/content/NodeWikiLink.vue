<template>
  <NuxtLink :to="`/concept/${target}`" class="wiki-link">
    {{ label }}
  </NuxtLink>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'

const props = defineProps<{
  node: JsonContent
}>()

const target = computed(() => typeof props.node.attrs?.target === 'string' ? props.node.attrs.target : '')
const label = computed(() => {
  if (typeof props.node.attrs?.label === 'string' && props.node.attrs.label.trim()) {
    return props.node.attrs.label
  }

  return target.value
})
</script>