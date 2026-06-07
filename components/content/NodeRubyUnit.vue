<template>
  <ruby class="ruby-unit" :data-lang="lang">
    <rb>{{ base }}</rb>
    <rt>{{ reading }}</rt>
  </ruby>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { JsonContent } from '~/types/content'
import { DEFAULT_ANNOT_LANG, isAnnotLang, type AnnotLang } from '~/extensions/rubyUnit'

const props = defineProps<{ node: JsonContent }>()

const base = computed(() => {
  const raw = props.node.attrs?.base
  return typeof raw === 'string' ? raw : ''
})

const reading = computed(() => {
  const raw = props.node.attrs?.reading
  return typeof raw === 'string' ? raw : ''
})

const lang = computed<AnnotLang>(() => {
  const raw = props.node.attrs?.lang
  return isAnnotLang(raw) ? raw : DEFAULT_ANNOT_LANG
})
</script>

<style>
/* Shared ruby-unit styles — mirrors components/admin/editor/RubyUnitNodeView.vue.
   Kept un-scoped so authors and readers see the exact same ruby chrome. */
.ruby-unit {
  ruby-position: over;
  ruby-align: center;
  display: inline-block;
  line-height: 1.85;
}

.ruby-unit > rb {
  font-size: 1em;
}

.ruby-unit > rt {
  font-size: 0.55em;
  line-height: 1;
  color: var(--pb-text-muted);
  font-feature-settings: 'tnum' on;
  letter-spacing: 0.02em;
}

.ruby-unit[data-lang='cmn'] > rt {
  font-family: ui-sans-serif, system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: var(--pb-link);
}

.ruby-unit[data-lang='yue'] > rt {
  font-family: ui-sans-serif, system-ui, -apple-system, 'PingFang HK', 'Microsoft YaHei', sans-serif;
  color: var(--pb-link);
}

.ruby-unit[data-lang='jpn'] > rt {
  font-family: ui-sans-serif, system-ui, -apple-system, 'Hiragino Sans', 'Yu Gothic UI', 'Noto Sans JP', sans-serif;
  color: var(--pb-text-muted);
}
</style>
