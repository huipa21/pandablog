<template>
  <!-- Inline (3-column) variant -->
  <aside
    v-if="inline"
    v-show="open"
    class="fixed inset-0 z-50 flex h-full w-full flex-col border-r border-stone-200 bg-white shadow-lg md:absolute md:inset-y-0 md:left-0 md:z-40 md:w-[320px]"
    data-testid="block-inserter-panel"
    data-inline="true"
    @keydown.esc="$emit('close')"
  >
    <BlockInserterBody @close="$emit('close')" @insert="$emit('insert', $event)" />
  </aside>

  <!-- Overlay variant (legacy / fallback) -->
  <Teleport v-else to="body">
    <div v-if="open" class="fixed inset-0 z-50" data-testid="block-inserter-panel" @keydown.esc="$emit('close')">
      <button type="button" class="absolute inset-0 cursor-default bg-black/20" :aria-label="t('admin.editor.inserter.close')" @click="$emit('close')" />
      <aside class="absolute inset-0 flex w-full flex-col border-r border-stone-200 bg-white shadow-xl md:bottom-0 md:left-0 md:top-0 md:w-[320px]">
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

const { t } = useI18n()
</script>
