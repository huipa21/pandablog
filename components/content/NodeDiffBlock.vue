<template>
  <div
    class="diff-block my-4"
    data-type="diff-block"
    :data-language="language"
    :data-old-label="oldLabel"
    :data-new-label="newLabel"
  >
    <DiffBlockSurface
      :old-text="oldText"
      :new-text="newText"
      :language="language"
      :old-label="oldLabel"
      :new-label="newLabel"
    />
  </div>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'
import DiffBlockSurface from './DiffBlockSurface.vue'
import {
  DEFAULT_DIFF_NEW_LABEL,
  DEFAULT_DIFF_NEW_TEXT,
  DEFAULT_DIFF_OLD_LABEL,
  DEFAULT_DIFF_OLD_TEXT,
  normalizeDiffLanguage
} from '~/utils/diffBlock'

const props = defineProps<{
  node: JsonContent
}>()

const oldText = computed(() => typeof props.node.attrs?.oldText === 'string' ? props.node.attrs.oldText : DEFAULT_DIFF_OLD_TEXT)
const newText = computed(() => typeof props.node.attrs?.newText === 'string' ? props.node.attrs.newText : DEFAULT_DIFF_NEW_TEXT)
const language = computed(() => normalizeDiffLanguage(props.node.attrs?.language))
const oldLabel = computed(() => typeof props.node.attrs?.oldLabel === 'string' ? props.node.attrs.oldLabel : DEFAULT_DIFF_OLD_LABEL)
const newLabel = computed(() => typeof props.node.attrs?.newLabel === 'string' ? props.node.attrs.newLabel : DEFAULT_DIFF_NEW_LABEL)
</script>
