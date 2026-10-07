<template>
  <UDropdownMenu v-model:open="open" :items="items" :content="{ side: 'bottom', align: 'start', onCloseAutoFocus: preventAutoFocus }">
    <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-plus" :aria-label="label" @mousedown.prevent />
  </UDropdownMenu>
</template>

<script setup lang="ts">
import type { DialogueLineKind } from '~/extensions/dialogueBlock'
defineProps<{ label: string }>()
const emit = defineEmits<{ select: [kind: Extract<DialogueLineKind, 'speech' | 'narration'>] }>()
const { t } = useI18n()
const open = ref(false)
let pendingKind: 'speech' | 'narration' | null = null
// Run after the menu's focus trap closes, so typing continues in the editor.
// Escape still uses the default behavior of returning focus to the plus button.
function preventAutoFocus(event: Event) {
  if (!pendingKind) return
  event.preventDefault()
  const kind = pendingKind
  pendingKind = null
  emit('select', kind)
}
function select(kind: 'speech' | 'narration') {
  pendingKind = kind
  open.value = false
}
const items = computed(() => [
  { label: t('admin.editor.dialogue.speech'), onSelect: () => select('speech') },
  { label: t('admin.editor.dialogue.narration'), onSelect: () => select('narration') }
])
</script>
