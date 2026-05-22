<template>
  <div class="flex h-full flex-col">
    <div class="flex h-14 items-center justify-between border-b border-stone-200 px-4">
      <div>
        <h2 class="text-sm font-semibold text-stone-950">Add Block</h2>
        <p class="text-xs text-stone-500">Choose what to insert next.</p>
      </div>
      <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="$emit('close')" />
    </div>

    <div class="border-b border-stone-200 p-3">
      <UInput v-model="query" icon="i-lucide-search" placeholder="Search blocks" autofocus />
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      <div v-for="group in groupedBlocks" :key="group.label" class="mb-5">
        <div class="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-stone-400">{{ group.label }}</div>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="block in group.blocks"
            :key="block.name"
            type="button"
            class="flex min-h-24 flex-col items-center justify-center gap-2 rounded-md border border-stone-200 bg-white p-2 text-center text-xs text-stone-700 transition hover:border-teal-300 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-stone-200 disabled:hover:bg-white"
            :data-testid="`block-inserter-item-${block.name}`"
            :disabled="!block.implemented"
            @click="$emit('insert', block.name)"
          >
            <UIcon :name="block.icon" class="size-5 text-teal-700" />
            <span class="font-medium leading-tight">{{ block.title }}</span>
            <span v-if="!block.implemented" class="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-stone-500">Next</span>
          </button>
        </div>
      </div>

      <p v-if="!groupedBlocks.length" class="px-2 py-8 text-center text-sm text-stone-500">
        No blocks match that search.
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
const blockRegistry = useBlockRegistry()

const groupedBlocks = computed(() => {
  if (query.value.trim()) {
    const blocks = blockRegistry.searchBlocks(query.value)
    return blocks.length ? [{ label: 'Search Results', blocks }] : []
  }

  return blockRegistry.categories
    .map((category) => ({
      label: category.label,
      blocks: blockRegistry.getBlocksByCategory(category.value)
    }))
    .filter((group): group is { label: string, blocks: BlockDefinition[] } => group.blocks.length > 0)
})
</script>
