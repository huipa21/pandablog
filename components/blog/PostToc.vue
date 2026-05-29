<template>
  <nav class="rounded-lg border border-stone-200 bg-white p-4">
    <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">Table of Contents</h3>
    <div v-if="items.length" class="grid gap-1">
      <a
        v-for="item in items"
        :key="item.id"
        :href="`#${item.id}`"
        class="rounded px-2 py-1 text-sm transition hover:bg-stone-50 hover:text-teal-700"
        :class="item.id === activeId ? 'bg-teal-50 font-medium text-teal-700' : 'text-stone-600'"
        :style="{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }"
        @click.prevent="scrollToHeading(item.id)"
      >
        {{ item.text }}
      </a>
    </div>
  </nav>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'

const props = defineProps<{
  contentJson: JsonContent
}>()

const content = computed(() => props.contentJson)
const { items, activeId } = useTableOfContents(content)

function scrollToHeading(id: string) {
  const heading = document.getElementById(id)
  if (!heading) {
    return
  }

  activeId.value = id
  heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>
