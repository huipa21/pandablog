<template>
  <div class="dialogue-character-picker w-64 max-w-[calc(100vw-2rem)] space-y-2 p-3" data-testid="dialogue-character-picker" @keydown="onKeydown">
    <input ref="searchInput" v-model="query" class="w-full rounded border border-[var(--pb-divider)] bg-transparent p-2 text-sm" :placeholder="t('admin.editor.dialogue.search')" :aria-label="t('admin.editor.dialogue.search')" role="combobox" aria-autocomplete="list" aria-expanded="true" :aria-controls="listId" :aria-activedescendant="choices.length ? `${listId}-${activeIndex}` : undefined">
    <div :id="listId" role="listbox" :aria-label="t('admin.editor.dialogue.characters')" class="max-h-56 overflow-y-auto">
      <button v-for="(character, index) in filtered" :id="`${listId}-${index}`" :key="character.id" type="button" role="option" :aria-selected="character.id === currentId" class="flex w-full items-center gap-2 rounded p-2 text-left text-sm" :class="index === activeIndex ? 'bg-[var(--pb-selected-bg)]' : ''" @mouseenter="activeIndex = index" @click="emit('select', character.id)">
        <span class="size-3 shrink-0 rounded-full" :style="{ backgroundColor: character.color }" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">{{ character.name }}</span>
        <UIcon v-if="character.id === currentId" name="i-lucide-check" class="size-4" />
      </button>
      <button v-if="canCreate" :id="`${listId}-${filtered.length}`" type="button" role="option" aria-selected="false" class="w-full rounded p-2 text-left text-sm font-semibold" :class="activeIndex === filtered.length ? 'bg-[var(--pb-selected-bg)]' : ''" @click="emit('create', query.trim())">{{ t('admin.editor.dialogue.newCharacter', { name: query.trim() }) }}</button>
    </div>
    <p class="text-xs text-[var(--pb-text-muted)]">{{ t('admin.editor.dialogue.shortcutHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { DIALOGUE_MAX_CHARACTERS, findCharacterByName, type DialogueCharacter } from '~/extensions/dialogueBlock'
const props = defineProps<{ characters: DialogueCharacter[], currentId: string | null }>()
const emit = defineEmits<{ select: [id: string], create: [name: string], close: [] }>()
const { t } = useI18n()
const listId = useId()
const searchInput = ref<HTMLInputElement | null>(null)
const query = ref('')
const activeIndex = ref(0)
const filtered = computed(() => props.characters.filter((character) => character.name.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())))
const canCreate = computed(() => !!query.value.trim() && props.characters.length < DIALOGUE_MAX_CHARACTERS && !findCharacterByName(props.characters, query.value))
const choices = computed(() => canCreate.value ? [...filtered.value, { id: '', name: query.value, color: '' }] : filtered.value)
watch(query, () => { activeIndex.value = 0 })
onMounted(() => searchInput.value?.focus())
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); return }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const count = choices.value.length
    if (count) activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count
    nextTick(() => document.getElementById(`${listId}-${activeIndex.value}`)?.scrollIntoView({ block: 'nearest' }))
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const choice = choices.value[activeIndex.value]
    if (choice?.id) emit('select', choice.id)
    else if (canCreate.value) emit('create', query.value.trim())
  }
}
</script>
