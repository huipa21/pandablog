<template>
  <div
    v-if="open"
    class="fixed z-50 max-h-[min(70vh,28rem)] w-72 overflow-y-auto overscroll-contain rounded-md border border-stone-200 bg-white shadow-xl"
    data-testid="slash-command-menu"
    :style="{ top: `${position.top}px`, left: `${position.left}px` }"
  >
    <div class="border-b border-stone-100 px-3 py-2 text-xs text-stone-500">
      {{ query ? t('admin.editor.slashMenu.matching', { query }) : t('admin.editor.slashMenu.insertBlock') }}
    </div>
    <button
      v-for="(item, index) in items"
      :key="item.name"
      type="button"
      class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-45"
      :class="index === selectedIndex ? 'bg-teal-50 text-teal-950' : 'text-stone-700 hover:bg-stone-50'"
      :disabled="!item.implemented"
      @mouseenter="$emit('select-index', index)"
      @mousedown.prevent="$emit('pick', item.name)"
    >
      <UIcon :name="item.icon" class="size-4 text-teal-700" />
      <span class="min-w-0 flex-1">
        <span class="block font-medium">{{ item.title }}</span>
        <span class="block truncate text-xs text-stone-500">{{ item.description }}</span>
      </span>
      <span v-if="!item.implemented" class="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-stone-500">{{ t('admin.editor.slashMenu.next') }}</span>
    </button>
    <p v-if="!items.length" class="px-3 py-4 text-sm text-stone-500">{{ t('admin.editor.slashMenu.noMatches') }}</p>
  </div>
</template>

<script setup lang="ts">
import type { BlockDefinition } from '~/composables/useBlockRegistry'

defineProps<{
  open: boolean
  query: string
  items: BlockDefinition[]
  selectedIndex: number
  position: { top: number, left: number }
}>()

const { t } = useI18n()

defineEmits<{
  pick: [name: string]
  'select-index': [index: number]
}>()
</script>