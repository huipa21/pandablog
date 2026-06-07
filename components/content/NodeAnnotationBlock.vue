<template>
  <div class="annotation-block" :data-lang="lang">
    <ContentRenderer
      v-for="(child, index) in children"
      :key="index"
      :node="child"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { JsonContent } from '~/types/content'
import { DEFAULT_ANNOT_LANG, isAnnotLang, type AnnotLang } from '~/extensions/rubyUnit'
import ContentRenderer from './ContentRenderer.vue'

const props = defineProps<{ node: JsonContent }>()

const lang = computed<AnnotLang>(() => {
  const raw = props.node.attrs?.lang
  return isAnnotLang(raw) ? raw : DEFAULT_ANNOT_LANG
})

const children = computed(() => props.node.content ?? [])
</script>

<style>
/* Shared annotation-block styles — mirrors components/admin/editor/AnnotationBlockNodeView.vue.
   Kept un-scoped so authors and readers see the exact same block chrome. */
.annotation-block {
  display: block;
  padding: 0.85rem 1rem;
  margin: 1.25rem 0;
  border: 1px solid var(--pb-divider);
  border-radius: var(--pb-radius-md);
  background: var(--pb-surface);
  line-height: 1.85;
}

.annotation-block[data-lang='cmn'],
.annotation-block[data-lang='yue'],
.annotation-block[data-lang='jpn'] {
  border-color: color-mix(in srgb, var(--pb-link) 30%, var(--pb-divider));
}

.annotation-block .annotation-block-content {
  font-size: 1.05em;
}
</style>
