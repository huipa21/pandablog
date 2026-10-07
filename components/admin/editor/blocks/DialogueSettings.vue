<template>
  <details ref="settingsRoot" open class="rounded-md border border-[var(--pb-divider)] bg-[var(--pb-card-bg)] p-3" data-testid="dialogue-settings">
    <summary class="cursor-pointer text-sm font-semibold">{{ t('admin.editor.dialogue.title') }}</summary>
    <div class="mt-3 space-y-4">
      <div class="space-y-2">
        <h3 class="text-sm font-semibold">{{ t('admin.editor.dialogue.style') }}</h3>
        <div class="grid grid-cols-3 gap-2">
          <button v-for="style in styles" :key="style" type="button" class="min-w-0 rounded-[var(--pb-radius-sm)] border p-2 text-xs" :class="normalized.dialogueStyle === style ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)] ring-1 ring-[var(--pb-selected-border)]' : 'border-[var(--pb-divider)]'" :aria-pressed="normalized.dialogueStyle === style" @click="emit('update', { dialogueStyle: style })">
            <span class="mb-2 flex items-center gap-1" aria-hidden="true">
              <span class="size-3 shrink-0 bg-[var(--pb-selected-bg)]" :class="style === 'avatar' ? 'rounded-full' : style === 'accent' ? 'border-l-2 border-[var(--pb-link)]' : ''" />
              <span class="h-1 w-full rounded bg-[var(--pb-text-muted)]" />
            </span>
            {{ t(`admin.editor.dialogue.${style}`) }}
          </button>
        </div>
      </div>
      <div class="space-y-2">
        <h3 class="text-sm font-semibold">{{ t('admin.editor.dialogue.characters') }}</h3>
        <div v-for="character in normalized.characters" :key="character.id" class="space-y-2 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-2" data-testid="dialogue-character-settings">
          <div class="flex items-center gap-2">
            <UPopover :open="appearanceId === character.id" :content="{ onCloseAutoFocus: onAppearanceCloseAutoFocus }" @update:open="onAppearanceOpen(character.id, $event)">
              <button type="button" class="dialogue-avatar border border-[var(--pb-divider)] text-[var(--pb-text)]" :style="{ '--pb-dialogue-color': character.color }" :aria-label="t('admin.editor.dialogue.appearance')">
                <img v-if="character.avatarSrc" :src="avatarUrl(character.avatarSrc)" alt="">
                <template v-else>{{ initialsOf(character.name) }}</template>
              </button>
              <template #content>
                <div class="space-y-3 p-3" data-testid="dialogue-character-appearance">
                  <div class="grid grid-cols-4 gap-2" role="group" :aria-label="t('admin.editor.dialogue.color')">
                    <button v-for="color in DIALOGUE_PALETTE" :key="color" type="button" class="size-7 rounded-full border-2" :class="color === character.color ? 'border-[var(--pb-text)]' : 'border-transparent'" :style="{ backgroundColor: color }" :aria-label="color" :aria-pressed="color === character.color" @click="updateCharacter(character, { color })" />
                  </div>
                  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-image" @click="pickAvatar(character.id)">{{ t('admin.editor.dialogue.pickAvatar') }}</UButton>
                  <UButton v-if="character.avatarSrc" size="xs" color="neutral" variant="ghost" @click="updateCharacter(character, { avatarSrc: null, avatarMediaId: null })">{{ t('admin.editor.dialogue.clearAvatar') }}</UButton>
                </div>
              </template>
            </UPopover>
            <input :value="character.name" maxlength="40" class="min-w-0 w-full rounded border border-[var(--pb-divider)] bg-transparent p-1 text-sm" :aria-label="t('admin.editor.dialogue.name')" @change="updateCharacter(character, { name: ($event.target as HTMLInputElement).value })">
            <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash" :aria-label="t('admin.editor.dialogue.deleteCharacter')" @click="askDelete(character.id)" />
          </div>
        </div>
        <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-plus" :disabled="normalized.characters.length >= DIALOGUE_MAX_CHARACTERS || !editor?.isEditable" @click="addCharacter">{{ t('admin.editor.dialogue.addCharacter') }}</UButton>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <UFormField :label="t('admin.editor.settingsPanel.marginAbove')"><UInput :model-value="normalized.marginTop" @change="emit('update', { marginTop: ($event.target as HTMLInputElement).value })" /></UFormField>
        <UFormField :label="t('admin.editor.settingsPanel.marginBelow')"><UInput :model-value="normalized.marginBottom" @change="emit('update', { marginBottom: ($event.target as HTMLInputElement).value })" /></UFormField>
      </div>
    </div>
    <MediaPicker v-model:open="mediaOpen" type-filter="image" @select="onMediaSelected" />
    <ConfirmActionDialog :open="!!deleteId" :title="t('admin.editor.dialogue.deleteCharacter')" :description="t('admin.editor.dialogue.deleteCharacterConfirm')" :confirm-label="t('admin.editor.dialogue.deleteCharacter')" :cancel-label="t('admin.editor.dialogue.cancel')" @update:open="onDeleteDialogOpen" @confirm="confirmDelete" />
  </details>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { MediaRecord } from '~/types/content'
import { DIALOGUE_MAX_CHARACTERS, DIALOGUE_PALETTE, findCharacterByName, initialsOf, normalizeDialogueAttrs, type DialogueCharacter, type DialogueStyle } from '~/extensions/dialogueBlock'
import MediaPicker from '~/components/admin/media/MediaPicker.vue'
import ConfirmActionDialog from '~/components/admin/ConfirmActionDialog.vue'
import '~/assets/css/dialogue-block.css'
const props = defineProps<{ editor: Editor | null, attrs: Record<string, unknown>, pos: number | null }>()
const emit = defineEmits<{ update: [attrs: Record<string, unknown>] }>()
const { t } = useI18n()
const { toPublicMediaUrl: avatarUrl } = useMediaUrl()
const styles: DialogueStyle[] = ['compact', 'accent', 'avatar']
const normalized = computed(() => normalizeDialogueAttrs(props.attrs))
const settingsRoot = ref<HTMLDetailsElement | null>(null)
const appearanceId = ref<string | null>(null)
const mediaOpen = ref(false)
let pendingAvatar = false
const avatarId = ref<string | null>(null)
const deleteId = ref<string | null>(null)
const targetBlockId = ref<unknown>(null)
watch([() => props.pos, () => props.attrs.blockId], () => {
  mediaOpen.value = false
  appearanceId.value = null
  deleteId.value = null
  avatarId.value = null
  pendingAvatar = false
})
function validTarget() {
  return props.editor?.isEditable && props.pos !== null && props.editor.state.doc.nodeAt(props.pos)?.type.name === 'dialogueBlock'
}
function addCharacter() {
  if (!validTarget() || normalized.value.characters.length >= DIALOGUE_MAX_CHARACTERS) return
  let number = normalized.value.characters.length + 1
  let name = t('admin.editor.dialogue.characterName', { number })
  while (findCharacterByName(normalized.value.characters, name)) name = t('admin.editor.dialogue.characterName', { number: ++number })
  if (!props.editor!.chain().setNodeSelection(props.pos!).upsertDialogueCharacter({ name }).run()) return
  nextTick(() => {
    const inputs = settingsRoot.value?.querySelectorAll<HTMLInputElement>('[data-testid="dialogue-character-settings"] input')
    const input = inputs?.item(inputs.length - 1)
    input?.focus()
    input?.select()
  })
}
function onAppearanceOpen(id: string, open: boolean) {
  appearanceId.value = open ? id : appearanceId.value === id ? null : appearanceId.value
}
function onAppearanceCloseAutoFocus(event: Event) {
  if (!pendingAvatar) return
  event.preventDefault()
  pendingAvatar = false
  if (validTarget() && targetBlockId.value === props.attrs.blockId) mediaOpen.value = true
}
function updateCharacter(character: DialogueCharacter, patch: Partial<DialogueCharacter>) {
  if (!validTarget()) return
  props.editor!.chain().setNodeSelection(props.pos!).upsertDialogueCharacter({ ...character, ...patch }).run()
}
function askDelete(id: string) { targetBlockId.value = props.attrs.blockId; deleteId.value = id }
function onDeleteDialogOpen(open: boolean) {
  if (!open) deleteId.value = null
}
function confirmDelete() {
  if (deleteId.value && validTarget() && targetBlockId.value === props.attrs.blockId) props.editor!.chain().setNodeSelection(props.pos!).removeDialogueCharacter(deleteId.value).run()
  deleteId.value = null
}
function pickAvatar(id: string) {
  if (!validTarget()) return
  targetBlockId.value = props.attrs.blockId
  avatarId.value = id
  pendingAvatar = true
  appearanceId.value = null
}
function onMediaSelected(files: MediaRecord[]) {
  const file = files[0]
  const character = normalized.value.characters.find((item) => item.id === avatarId.value)
  if (file?.mime_type.startsWith('image/') && character && validTarget() && targetBlockId.value === props.attrs.blockId) {
    // Canonical library path only; never retain an arbitrary host supplied by a record.
    updateCharacter(character, { avatarMediaId: String(file.id), avatarSrc: `/media/${encodeURIComponent(file.hash)}` })
  }
  mediaOpen.value = false
  avatarId.value = null
}
</script>
