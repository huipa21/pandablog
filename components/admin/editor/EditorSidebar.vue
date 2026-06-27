<template>
  <aside data-testid="editor-sidebar-panel" class="h-full border-l border-[var(--pb-divider)] bg-[var(--pb-card-bg)] pt-12 md:pt-0">
    <div class="h-full overflow-y-auto p-4">
      <BlockSettings :editor="editor" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core'
// Explicit import: Nuxt auto-registers nested components with a path prefix
// (`AdminEditorBlockSettings`), so the short `<BlockSettings>` tag below
// would otherwise fail to resolve.
import BlockSettings from '~/components/admin/editor/blocks/BlockSettings.vue'

const props = defineProps<{
  editor: Editor | null
}>()

void props
</script>