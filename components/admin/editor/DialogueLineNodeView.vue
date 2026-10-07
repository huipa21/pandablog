<template>
  <NodeViewWrapper class="dialogue-line" data-type="dialogue-line" :data-kind="lineAttrs.kind" :data-character-id="lineAttrs.characterId" :style="{ '--pb-dialogue-color': character?.color }">
    <UPopover v-model:open="pickerOpen" :content="{ side: 'bottom', align: 'start', onCloseAutoFocus: onPickerCloseAutoFocus }" @update:open="onPickerOpen">
      <button class="dialogue-speaker" type="button" contenteditable="false" :disabled="!editor.isEditable" :aria-hidden="lineAttrs.kind === 'narration' ? 'true' : undefined" :tabindex="lineAttrs.kind === 'narration' ? -1 : undefined" :aria-label="t('admin.editor.dialogue.changeCharacter')" @mousedown.prevent="focusLine">
        <template v-if="character">
          <span v-if="blockAttrs.dialogueStyle === 'avatar'" class="dialogue-avatar" aria-hidden="true">
            <img v-if="character.avatarSrc" :src="avatarUrl(character.avatarSrc)" alt="">
            <template v-else>{{ initialsOf(character.name) }}</template>
          </span>
          <span class="dialogue-speaker-name" :title="character.name">{{ character.name }}</span>
          <span v-if="lineAttrs.kind === 'thought'" class="dialogue-thought-label">{{ t('admin.editor.dialogue.thoughtLabel') }}</span>
        </template>
      </button>
      <template #content>
        <DialogueCharacterPicker :characters="blockAttrs.characters" :current-id="lineAttrs.characterId" @select="selectCharacter" @create="createCharacter" @close="closePicker" />
      </template>
    </UPopover>
    <NodeViewContent class="dialogue-text" />
    <div v-if="editor.isEditable" class="dialogue-line-chrome" contenteditable="false">
      <UDropdownMenu :items="menuItems">
        <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-ellipsis" :aria-label="t('admin.editor.dialogue.lineMenu')" @mousedown.prevent="focusLine" />
      </UDropdownMenu>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { generateDialogueCharacterId, initialsOf, normalizeDialogueAttrs, normalizeDialogueLineAttrs, resolveCharacter, type DialogueLineKind } from '~/extensions/dialogueBlock'
import DialogueCharacterPicker from './DialogueCharacterPicker.vue'
import '~/assets/css/dialogue-block.css'
const props = defineProps(nodeViewProps)
const { t } = useI18n()
const { toPublicMediaUrl: avatarUrl } = useMediaUrl()
const pickerOpen = ref(false)
const tick = ref(0)
function refresh() { tick.value += 1 }
props.editor.on('transaction', refresh)
onBeforeUnmount(() => props.editor.off('transaction', refresh))
const blockAttrs = computed(() => {
  void tick.value
  const pos = props.getPos()
  return normalizeDialogueAttrs(typeof pos === 'number' ? props.editor.state.doc.resolve(pos).parent.attrs : {})
})
const lineAttrs = computed(() => normalizeDialogueLineAttrs(props.node.attrs, new Set(blockAttrs.value.characters.map((character) => character.id))))
const character = computed(() => resolveCharacter(blockAttrs.value.characters, lineAttrs.value.characterId))
function focusLine() {
  const pos = props.getPos()
  if (typeof pos !== 'number') return false
  // Preserve a caret/range already inside this line, otherwise select its start.
  const selection = props.editor.state.selection
  if (selection.from < pos + 1 || selection.to > pos + props.node.nodeSize - 1) props.editor.commands.setTextSelection(pos + 1)
  return true
}
function closePicker() { pickerOpen.value = false; focusLine(); props.editor.view.focus() }
function onPickerOpen(open: boolean) { if (!open) { focusLine(); props.editor.view.focus() } }
function onPickerCloseAutoFocus(event: Event) {
  event.preventDefault()
  focusLine()
  props.editor.view.focus()
}
function selectCharacter(id: string) {
  focusLine()
  props.editor.commands.setDialogueLineCharacter(id)
  closePicker()
}
function createCharacter(name: string) {
  focusLine()
  const id = generateDialogueCharacterId()
  props.editor.chain().upsertDialogueCharacter({ id, name }).setDialogueLineCharacter(id).run()
  closePicker()
}
function run(action: () => void) { focusLine(); action(); props.editor.view.focus() }
function setKind(kind: DialogueLineKind) { run(() => props.editor.commands.setDialogueLineKind(kind)) }
const menuItems = computed(() => [[
  { label: t('admin.editor.dialogue.changeCharacter'), onSelect: () => { focusLine(); pickerOpen.value = true } },
  { label: t('admin.editor.dialogue.addBelow'), onSelect: () => run(() => props.editor.commands.addDialogueLine()) }
], ['speech', 'narration', 'thought'].map((kind) => ({ label: t(`admin.editor.dialogue.${kind}`), onSelect: () => setKind(kind as DialogueLineKind) })), [
  { label: t('admin.editor.dialogue.duplicateLine'), onSelect: () => run(() => props.editor.commands.duplicateDialogueLine()) },
  { label: t('admin.editor.dialogue.moveUp'), onSelect: () => run(() => props.editor.commands.moveDialogueLine('up')) },
  { label: t('admin.editor.dialogue.moveDown'), onSelect: () => run(() => props.editor.commands.moveDialogueLine('down')) },
  { label: t('admin.editor.dialogue.deleteLine'), onSelect: () => run(() => props.editor.commands.deleteDialogueLine()) }
]])
</script>
