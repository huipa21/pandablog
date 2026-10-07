<template>
  <NodeViewWrapper class="disabled-content-block" contenteditable="false" role="note">
    {{ t('admin.editor.dialogue.disabled') }}
  </NodeViewWrapper>
</template>
<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
defineProps(nodeViewProps)
const { t } = useI18n()
</script>
