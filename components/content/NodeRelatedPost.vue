<template>
  <NuxtLink v-if="target" :to="`/blog/${target}`" class="related-post-chip inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 hover:bg-teal-100">
    <UIcon name="i-lucide-link" class="size-3" />
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
