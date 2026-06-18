<template>
  <div class="block-inserter-body flex h-full flex-col">
    <div class="block-inserter-header flex h-14 items-center justify-between px-4">
      <div>
        <h2 class="text-sm font-semibold">{{ t('admin.editor.inserter.addBlock') }}</h2>
        <p class="block-inserter-description text-xs">{{ t('admin.editor.inserter.description') }}</p>
      </div>
      <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="$emit('close')" />
    </div>

    <div class="block-inserter-search p-3">
      <UInput v-model="query" icon="i-lucide-search" :placeholder="t('admin.editor.inserter.searchBlocks')" autofocus />
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      <div v-for="group in groupedBlocks" :key="group.label" class="mb-5">
        <div class="block-inserter-group-label mb-2 px-1 text-xs font-medium uppercase tracking-wider">{{ group.label }}</div>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="block in group.blocks"
            :key="block.name"
            type="button"
            class="block-inserter-item flex min-h-24 flex-col items-center justify-center gap-2 rounded-md p-2 text-center text-xs transition disabled:cursor-not-allowed disabled:opacity-45"
            :data-testid="`block-inserter-item-${block.name}`"
            :disabled="!block.implemented"
            @click="$emit('insert', block.name)"
          >
            <UIcon :name="block.icon" class="block-inserter-icon size-5" />
            <span class="font-medium leading-tight">{{ block.title }}</span>
            <span v-if="!block.implemented" class="block-inserter-next rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider">{{ t('admin.editor.inserter.next') }}</span>
          </button>
        </div>
      </div>

      <p v-if="!groupedBlocks.length" class="block-inserter-empty px-2 py-8 text-center text-sm">
        {{ t('admin.editor.inserter.noMatches') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BlockDefinition } from '~/composables/useBlockRegistry'

defineEmits<{
  close: []
  insert: [name: string]
}>()

const query = ref('')
const { t } = useI18n()
const blockRegistry = useBlockRegistry()

const groupedBlocks = computed(() => {
  if (query.value.trim()) {
    const blocks = blockRegistry.searchBlocks(query.value)
    return blocks.length ? [{ label: t('admin.editor.inserter.searchResults'), blocks }] : []
  }

  return blockRegistry.categories
    .map((category) => ({
      label: category.label,
      blocks: blockRegistry.getBlocksByCategory(category.value)
    }))
    .filter((group): group is { label: string, blocks: BlockDefinition[] } => group.blocks.length > 0)
})
</script>

<style scoped>
.block-inserter-body {
  background: var(--pb-surface);
  color: var(--pb-text);
}

.block-inserter-header,
.block-inserter-search {
  border-bottom: 1px solid var(--pb-divider);
}

.block-inserter-description,
.block-inserter-empty {
  color: var(--pb-text-muted);
}

.block-inserter-group-label {
  color: var(--pb-text-subtle);
}

.block-inserter-item {
  border: 1px solid var(--pb-card-border);
  background: var(--pb-card-bg);
  color: var(--pb-text-muted);
}

.block-inserter-item:hover:not(:disabled) {
  border-color: var(--pb-selected-border);
  background: var(--pb-selected-bg);
  color: var(--pb-text);
}

.block-inserter-item:disabled:hover {
  border-color: var(--pb-card-border);
  background: var(--pb-card-bg);
}

.block-inserter-icon {
  color: var(--pb-primary);
}

.block-inserter-next {
  background: var(--pb-surface-subtle);
  color: var(--pb-text-subtle);
}
</style>
