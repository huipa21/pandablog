<template>
  <div class="dialogue-block" data-type="dialogue-block" :data-style="attrs.dialogueStyle">
    <div v-if="attrs.title" class="dialogue-block-title">{{ attrs.title }}</div>
    <div v-for="(line, index) in lines" :key="index" class="dialogue-line" data-type="dialogue-line" :data-kind="line.attrs.kind" :data-character-id="line.attrs.characterId" :style="{ '--pb-dialogue-color': line.character?.color }">
      <div class="dialogue-speaker" :aria-hidden="line.attrs.kind === 'narration' ? 'true' : undefined">
        <template v-if="line.character">
          <span v-if="attrs.dialogueStyle === 'avatar'" class="dialogue-avatar" aria-hidden="true">
            <img v-if="line.character.avatarSrc" :src="avatarUrl(line.character.avatarSrc)" alt="">
            <template v-else>{{ initialsOf(line.character.name) }}</template>
          </span>
          <span class="dialogue-speaker-name" :title="line.character.name">{{ line.character.name }}</span>
          <span v-if="line.attrs.kind === 'thought'" class="dialogue-thought-label">{{ t('admin.editor.dialogue.thoughtLabel') }}</span>
        </template>
      </div>
      <div class="dialogue-text">
        <ContentRenderer v-for="(child, childIndex) in line.node.content ?? []" :key="childIndex" :node="child" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'
import { initialsOf, normalizeDialogueAttrs, normalizeDialogueLineAttrs, resolveCharacter } from '~/extensions/dialogueBlock'
import ContentRenderer from './ContentRenderer.vue'
import '~/assets/css/dialogue-block.css'
import '~/assets/css/block-presentation.css'

const props = defineProps<{ node: JsonContent }>()
const { t } = useI18n()
const { toPublicMediaUrl: avatarUrl } = useMediaUrl()
const attrs = computed(() => normalizeDialogueAttrs(props.node.attrs))
const lines = computed(() => {
  const ids = new Set(attrs.value.characters.map((character) => character.id))
  return (props.node.content ?? []).filter((node) => node.type === 'dialogueLine').map((node) => {
    const lineAttrs = normalizeDialogueLineAttrs(node.attrs, ids)
    return { node, attrs: lineAttrs, character: resolveCharacter(attrs.value.characters, lineAttrs.characterId) }
  })
})
</script>
