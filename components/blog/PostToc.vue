<template>
  <nav class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
    <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--pb-text-subtle)]">{{ t('public.sidebar.toc') }}</h3>
    <div v-if="items.length" class="grid gap-1">
      <a
        v-for="item in items"
        :key="item.id"
        :href="`#${item.id}`"
        class="rounded-[var(--pb-radius-sm)] px-2 py-1 text-sm transition hover:bg-[var(--pb-selected-bg)] hover:text-[var(--pb-link-hover)]"
        :class="item.id === activeId ? 'bg-[var(--pb-selected-bg)] font-medium text-[var(--pb-link)]' : 'text-[var(--pb-text-muted)]'"
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

const { t } = useI18n()

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
