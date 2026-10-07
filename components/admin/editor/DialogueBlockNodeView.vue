<template>
  <NodeViewWrapper class="dialogue-block" data-type="dialogue-block" :data-style="attrs.dialogueStyle" :style="{ marginTop: attrs.marginTop, marginBottom: attrs.marginBottom }">
    <input v-if="attrs.title || active" class="dialogue-block-title" contenteditable="false" :value="node.attrs.title" :placeholder="t('admin.editor.dialogue.sceneTitle')" :aria-label="t('admin.editor.dialogue.sceneTitle')" maxlength="120" :readonly="!editor.isEditable" @change="updateAttributes({ title: ($event.target as HTMLInputElement).value })">
    <NodeViewContent class="dialogue-lines" />
    <div v-if="editor.isEditable" class="dialogue-block-chrome" contenteditable="false">
      <span>{{ t('admin.editor.dialogue.title') }}</span>
      <UDropdownMenu :items="menuItems">
        <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-ellipsis" :aria-label="t('admin.editor.dialogue.blockMenu')" />
      </UDropdownMenu>
    </div>
    <div v-if="editor.isEditable" class="dialogue-block-footer" contenteditable="false">
      <span>{{ t('admin.editor.dialogue.addLine') }}</span>
      <UButton v-for="kind in kinds" :key="kind" size="xs" variant="ghost" color="neutral" icon="i-lucide-plus" @click="addLine(kind)">{{ t(`admin.editor.dialogue.${kind}`) }}</UButton>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { normalizeDialogueAttrs, type DialogueLineKind, type DialogueStyle } from '~/extensions/dialogueBlock'
import '~/assets/css/dialogue-block.css'
const props = defineProps(nodeViewProps)
const { t } = useI18n()
const attrs = computed(() => normalizeDialogueAttrs(props.node.attrs))
const kinds: DialogueLineKind[] = ['speech', 'narration', 'thought']
const styles: DialogueStyle[] = ['compact', 'accent', 'avatar']
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
function duplicateBlock() {
  const pos = props.getPos()
  if (typeof pos !== 'number') return
  const json = props.node.toJSON()
  // BlockId assigns a fresh identity to copies.
  if (json.attrs) json.attrs.blockId = null
  props.editor.chain().focus().insertContentAt(pos + props.node.nodeSize, json).run()
}
const menuItems = computed(() => [styles.map((style) => ({
  label: t(`admin.editor.dialogue.${style}`),
  onSelect: () => props.updateAttributes({ dialogueStyle: style })
})), [
  { label: t('admin.editor.dialogue.duplicateBlock'), onSelect: duplicateBlock },
  { label: t('admin.editor.dialogue.deleteBlock'), onSelect: () => props.deleteNode() }
]])
</script>
