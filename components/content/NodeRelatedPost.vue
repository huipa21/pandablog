<template>
  <NuxtLink v-if="target" :to="`/blog/${target}`" class="related-post-chip inline-flex items-center gap-1 rounded-[var(--pb-radius-sm)] border border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)] px-2 py-0.5 text-xs font-medium text-[var(--pb-link)] hover:text-[var(--pb-link-hover)]">
    <UIcon name="i-lucide-link" class="size-3 text-[var(--pb-icon-accent)]" />
    {{ label }}
  </NuxtLink>
  <span v-else class="text-[var(--pb-text-subtle)]">{{ label || '(unlinked)' }}</span>
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
