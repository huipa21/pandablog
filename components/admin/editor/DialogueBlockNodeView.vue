<template>
  <NodeViewWrapper class="dialogue-block" data-type="dialogue-block" :data-active="active" :data-style="attrs.dialogueStyle">
    <input v-if="attrs.title || active" class="dialogue-block-title" contenteditable="false" :value="node.attrs.title" :placeholder="t('admin.editor.dialogue.sceneTitle')" :aria-label="t('admin.editor.dialogue.sceneTitle')" maxlength="120" :readonly="!editor.isEditable" @change="updateAttributes({ title: ($event.target as HTMLInputElement).value })">
    <NodeViewContent class="dialogue-lines" />
    <div v-if="editor.isEditable" class="dialogue-add-row" contenteditable="false">
      <DialogueLineKindMenu :label="t('admin.editor.dialogue.addLine')" @select="addLine" />
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { normalizeDialogueAttrs, type DialogueLineKind } from '~/extensions/dialogueBlock'
import DialogueLineKindMenu from './DialogueLineKindMenu.vue'
import '~/assets/css/dialogue-block.css'
import '~/assets/css/block-presentation.css'
const props = defineProps(nodeViewProps)
const { t } = useI18n()
const attrs = computed(() => normalizeDialogueAttrs(props.node.attrs))
const active = ref(props.selected)
function refreshActive() {
  const pos = props.getPos()
  const selection = props.editor.state.selection
  active.value = props.selected || (typeof pos === 'number' && selection.from >= pos && selection.to <= pos + props.node.nodeSize)
}
props.editor.on('selectionUpdate', refreshActive)
watch(() => props.selected, refreshActive)
onMounted(refreshActive)
onBeforeUnmount(() => props.editor.off('selectionUpdate', refreshActive))
function addLine(kind: DialogueLineKind) {
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  props.editor.chain().focus().setTextSelection(pos + props.node.nodeSize - 2).addDialogueLine(kind).run()
}
</script>
