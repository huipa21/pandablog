<template>
  <!-- Inline (3-column) variant -->
  <aside
    v-if="inline"
    v-show="open"
    class="absolute inset-y-0 left-0 z-40 flex h-full w-[320px] flex-col border-r border-stone-200 bg-white shadow-lg"
    data-testid="block-inserter-panel"
    data-inline="true"
    @keydown.esc="$emit('close')"
  >
    <BlockInserterBody @close="$emit('close')" @insert="$emit('insert', $event)" />
  </aside>

  <!-- Overlay variant (legacy / fallback) -->
  <Teleport v-else to="body">
    <div v-if="open" class="fixed inset-0 z-50" data-testid="block-inserter-panel" @keydown.esc="$emit('close')">
      <button type="button" class="absolute inset-0 cursor-default bg-black/20" aria-label="Close block inserter" @click="$emit('close')" />
      <aside class="absolute bottom-0 left-0 top-0 flex w-[320px] flex-col border-r border-stone-200 bg-white shadow-xl">
        <BlockInserterBody @close="$emit('close')" @insert="$emit('insert', $event)" />
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import BlockInserterBody from '~/components/admin/editor/blocks/BlockInserterBody.vue'

defineProps<{
  open: boolean
  inline?: boolean
}>()

defineEmits<{
  close: []
  insert: [name: string]
}>()
</script>
