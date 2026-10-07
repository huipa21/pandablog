<template>
  <NodeViewWrapper class="dialogue-line" data-type="dialogue-line" :data-active="active" :data-kind="lineAttrs.kind" :data-character-id="lineAttrs.characterId" :style="{ '--pb-dialogue-color': character?.color }">
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
      <UDropdownMenu :items="menuItems" :content="{ onCloseAutoFocus: onMenuCloseAutoFocus }">
        <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-ellipsis" :aria-label="t('admin.editor.dialogue.lineMenu')" @mousedown.prevent="focusLine" />
      </UDropdownMenu>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { closeHistory } from '@tiptap/pm/history'
import { generateDialogueCharacterId, initialsOf, normalizeDialogueAttrs, normalizeDialogueLineAttrs, resolveCharacter } from '~/extensions/dialogueBlock'
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
const active = computed(() => {
  void tick.value
  const pos = props.getPos()
  const selection = props.editor.state.selection
  return typeof pos === 'number' && selection.from >= pos + 1 && selection.to <= pos + props.node.nodeSize - 1
})
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
function run(action: () => void) {
  const editor = props.editor
  focusLine()
  // Each explicit menu action should undo separately from typing/other actions.
  editor.commands.command(({ tr }) => { closeHistory(tr); return true })
  action()
  // Moving/deleting can unmount this node view; retain the editor reference and
  // restore focus after both Vue's DOM patch and the menu's focus-scope cleanup.
  nextTick(() => requestAnimationFrame(() => {
    if (!editor.isDestroyed) editor.view.focus()
  }))
}
let pendingAction: (() => void) | null = null
function onMenuCloseAutoFocus(event: Event) {
  if (!pendingAction) return
  event.preventDefault()
  const action = pendingAction
  pendingAction = null
  // Finish Reka's focus-scope teardown before an action can update/unmount it.
  nextTick(() => setTimeout(() => run(action), 0))
}
const switchKind = computed(() => lineAttrs.value.kind === 'narration' ? 'speech' : 'narration')
const menuItems = computed(() => [[
  {
    label: t(`admin.editor.dialogue.${switchKind.value === 'speech' ? 'switchToDialogue' : 'switchToNarration'}`),
    icon: 'i-lucide-repeat-2',
    disabled: switchKind.value === 'speech' && !blockAttrs.value.characters.length,
    onSelect: () => { pendingAction = () => props.editor.commands.setDialogueLineKind(switchKind.value) }
  }
], [
  { label: t('admin.editor.dialogue.duplicateLine'), onSelect: () => { pendingAction = () => props.editor.commands.duplicateDialogueLine() } },
  { label: t('admin.editor.dialogue.moveUp'), onSelect: () => { pendingAction = () => props.editor.commands.moveDialogueLine('up') } },
  { label: t('admin.editor.dialogue.moveDown'), onSelect: () => { pendingAction = () => props.editor.commands.moveDialogueLine('down') } },
  { label: t('admin.editor.dialogue.deleteLine'), onSelect: () => { pendingAction = () => props.editor.commands.deleteDialogueLine() } }
]])
</script>
