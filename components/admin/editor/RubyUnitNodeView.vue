<template>
  <NodeViewWrapper
    as="span"
    class="ruby-unit-nodeview"
    :class="{ 'is-selected': selected }"
    :data-lang="lang"
  >
    <ruby class="ruby-unit" :data-lang="lang" @click.stop="togglePopover">
      <rb>{{ base }}</rb>
      <rt>{{ reading || '\u00a0' }}</rt>
    </ruby>

    <span
      v-if="popoverOpen"
      class="ruby-unit-popover"
      contenteditable="false"
      @mousedown.stop
      @click.stop
    >
      <span class="ruby-unit-popover-header">
        <UIcon name="i-lucide-languages" class="size-3.5" />
        <span class="ruby-unit-popover-base">{{ base }}</span>
        <span class="ruby-unit-popover-lang">{{ lang.toUpperCase() }}</span>
      </span>
      <input
        ref="readingInputEl"
        type="text"
        class="ruby-unit-popover-input"
        :value="reading"
        :placeholder="readingPlaceholder"
        @input="onReadingInput"
        @keydown.enter.prevent="closePopover"
        @keydown.esc.prevent="closePopover"
      >
      <span class="ruby-unit-popover-actions">
        <button type="button" class="ruby-unit-popover-action" @click="clearReading">Clear</button>
        <button type="button" class="ruby-unit-popover-action is-primary" @click="closePopover">Done</button>
      </span>
    </span>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/vue-3'
import { DEFAULT_ANNOT_LANG, isAnnotLang, type AnnotLang } from '~/extensions/rubyUnit'

const props = defineProps<NodeViewProps>()

const readingInputEl = ref<HTMLInputElement | null>(null)
const popoverOpen = ref(false)

const base = computed(() => String(props.node.attrs?.base ?? ''))
const reading = computed(() => String(props.node.attrs?.reading ?? ''))
const lang = computed<AnnotLang>(() => {
  const raw = props.node.attrs?.lang
  return isAnnotLang(raw) ? raw : DEFAULT_ANNOT_LANG
})

const readingPlaceholder = computed(() => {
  switch (lang.value) {
    case 'cmn': return 'pinyin'
    case 'yue': return 'jyutping'
    case 'jpn': return 'reading (hiragana)'
    default: return 'reading'
  }
})

async function togglePopover() {
  if (!props.editor?.isEditable) return
  popoverOpen.value = !popoverOpen.value
  if (popoverOpen.value) {
    await nextTick()
    readingInputEl.value?.focus()
    readingInputEl.value?.select()
  }
}

function closePopover() {
  popoverOpen.value = false
}

function onReadingInput(event: Event) {
  const target = event.target as HTMLInputElement
  props.updateAttributes({ reading: target.value })
}

function clearReading() {
  props.updateAttributes({ reading: '' })
}
</script>

<style scoped>
.ruby-unit-nodeview {
  position: relative;
  display: inline;
}

/* Visuals must mirror components/content/NodeRubyUnit.vue — what you see in the
   editor must equal what the reader sees on the published post. */
.ruby-unit {
  ruby-position: over;
  ruby-align: center;
  display: inline-block;
  line-height: 1.85;
  cursor: pointer;
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

.ruby-unit-nodeview.is-selected ruby {
  outline: 2px solid var(--pb-primary);
  border-radius: var(--pb-radius-sm);
}

.ruby-unit-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 60;
  display: inline-flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 220px;
  padding: 0.6rem;
  border-radius: var(--pb-radius-md);
  border: 1px solid var(--pb-divider);
  background: var(--pb-surface);
  box-shadow: 0 12px 32px color-mix(in srgb, var(--pb-text) 12%, transparent);
}

.ruby-unit-popover-header {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--pb-text-muted);
}

.ruby-unit-popover-base {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--pb-text);
}

.ruby-unit-popover-lang {
  margin-left: auto;
  padding: 0.05rem 0.4rem;
  border-radius: var(--pb-radius-sm);
  background: var(--pb-surface-subtle);
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  color: var(--pb-text-muted);
}

.ruby-unit-popover-input {
  width: 100%;
  padding: 0.35rem 0.5rem;
  border-radius: var(--pb-radius-sm);
  border: 1px solid var(--pb-divider);
  background: var(--pb-surface);
  font-size: 0.9rem;
  color: var(--pb-text);
}

.ruby-unit-popover-input:focus {
  outline: 2px solid var(--pb-primary);
  outline-offset: -1px;
}

.ruby-unit-popover-actions {
  display: inline-flex;
  justify-content: flex-end;
  gap: 0.35rem;
}

.ruby-unit-popover-action {
  padding: 0.25rem 0.6rem;
  border-radius: var(--pb-radius-sm);
  border: 1px solid var(--pb-divider);
  background: var(--pb-surface);
  font-size: 0.75rem;
  color: var(--pb-text-muted);
  cursor: pointer;
}

.ruby-unit-popover-action:hover {
  background: var(--pb-surface-subtle);
}

.ruby-unit-popover-action.is-primary {
  background: var(--pb-primary);
  color: var(--pb-primary-contrast);
  border-color: var(--pb-primary);
}

.ruby-unit-popover-action.is-primary:hover {
  background: var(--pb-primary-hover);
}
</style>
