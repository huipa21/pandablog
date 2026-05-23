<template>
  <NuxtLink v-if="target" :to="`/blog/${target}`" class="related-post-link inline-flex items-center gap-1 text-teal-700 hover:underline">
    <span aria-hidden="true">→</span>
    {{ label }}
  </NuxtLink>
  <span v-else class="text-stone-400">{{ label || '(unlinked)' }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { JsonContent } from '~/types/content'

const props = defineProps<{ node: JsonContent }>()

const target = computed(() => typeof props.node.attrs?.target === 'string' ? props.node.attrs.target : '')
const label = computed(() => {
  const raw = props.node.attrs?.label
  return typeof raw === 'string' && raw.trim() ? raw : target.value
})
</script>
