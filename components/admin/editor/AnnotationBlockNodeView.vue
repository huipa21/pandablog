<template>
  <NodeViewWrapper
    class="annotation-block-nodeview my-6"
    :class="{ 'is-selected': selected }"
    :data-lang="lang"
    data-node-view-wrapper
  >
    <div class="annotation-block" :data-lang="lang">
      <div
        v-if="selected"
        class="annotation-block-toolbar"
        contenteditable="false"
        @mousedown.prevent
      >
        <div class="annotation-block-toolbar-left">
          <UIcon name="i-lucide-languages" class="size-3.5" />
          <span class="annotation-block-toolbar-label">Annotation</span>
          <span class="annotation-block-toolbar-divider">·</span>
          <select
            class="annotation-block-lang-select"
            :value="lang"
            @change="onLangChange"
          >
            <option value="cmn">Mandarin (pinyin)</option>
            <option value="yue">Cantonese (jyutping)</option>
            <option value="jpn">Japanese (furigana)</option>
          </select>
        </div>

        <div class="annotation-block-toolbar-right">
          <button
            type="button"
            class="annotation-block-action"
            :disabled="busy || plainTextLength === 0"
            @click="annotateAll"
          >
            <UIcon name="i-lucide-wand-sparkles" class="size-3.5" />
            <span>{{ busy ? 'Annotating…' : 'Annotate all' }}</span>
          </button>
          <button
            type="button"
            class="annotation-block-action is-ghost"
            :disabled="busy || rubyCount === 0"
            @click="clearAnnotations"
          >
            <UIcon name="i-lucide-eraser" class="size-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <NodeViewContent as="div" class="annotation-block-content" />
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Fragment } from '@tiptap/pm/model'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { useReadings } from '~/composables/editor/useReadings'
import { DEFAULT_ANNOT_LANG, isAnnotLang, type AnnotLang } from '~/extensions/rubyUnit'

const props = defineProps(nodeViewProps)

const { annotate } = useReadings()

const busy = ref(false)

const lang = computed<AnnotLang>(() => {
  const raw = props.node.attrs?.lang
  return isAnnotLang(raw) ? raw : DEFAULT_ANNOT_LANG
})

const plainTextLength = computed(() => {
  let length = 0
  props.node.descendants((child) => {
    if (child.isText) length += (child.text ?? '').length
  })
  return length
})

const rubyCount = computed(() => {
  let count = 0
  props.node.descendants((child) => {
    if (child.type.name === 'rubyUnit') count += 1
  })
  return count
})

function onLangChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const next = target.value
  if (!isAnnotLang(next)) return
  props.updateAttributes({ lang: next })
}

async function annotateAll() {
  if (busy.value) return
  const editor = props.editor
  if (!editor) return

  const pos = props.getPos?.()
  if (typeof pos !== 'number') return

  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'annotationBlock') return

  // Collect plain-text runs (skip existing rubyUnit + other inline nodes).
  const text = collectPlainText(node)
  if (!text) return

  busy.value = true
  try {
    const segments = await annotate(text, lang.value)
    if (segments.length === 0) return

    const schema = editor.state.schema
    const rubyType = schema.nodes.rubyUnit
    if (!rubyType) return

    const fragmentNodes = segments.flatMap((segment) => {
      if (segment.kind === 'ruby') {
        return [rubyType.create({ base: segment.base, reading: segment.reading, lang: lang.value })]
      }
      if (segment.text) {
        return [schema.text(segment.text)]
      }
      return []
    })

    if (fragmentNodes.length === 0) return

    const tr = editor.state.tr
    const from = pos + 1 // skip into the block
    const to = pos + node.nodeSize - 1
    tr.replaceWith(from, to, Fragment.fromArray(fragmentNodes))
    tr.setMeta('addToHistory', true)
    editor.view.dispatch(tr)
  } catch (error) {
    console.error('[annotation-block] annotate failed', error)
  } finally {
    busy.value = false
  }
}

function clearAnnotations() {
  const editor = props.editor
  if (!editor) return

  const pos = props.getPos?.()
  if (typeof pos !== 'number') return

  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'annotationBlock') return

  const text = collectPlainText(node)
  const tr = editor.state.tr
  const from = pos + 1
  const to = pos + node.nodeSize - 1

  if (text) {
    tr.replaceWith(from, to, editor.state.schema.text(text))
  } else {
    tr.replaceWith(from, to, Fragment.empty)
  }

  tr.setMeta('addToHistory', true)
  editor.view.dispatch(tr)
}

function collectPlainText(node: typeof props.node): string {
  let buffer = ''
  node.descendants((child) => {
    if (child.isText) {
      buffer += child.text ?? ''
      return
    }
    if (child.type.name === 'rubyUnit') {
      buffer += String(child.attrs?.base ?? '')
    }
  })
  return buffer
}
</script>

<style scoped>
/* Visuals must mirror components/content/NodeAnnotationBlock.vue — what you see
   in the editor must equal what the reader sees on the published post. */
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

.annotation-block-nodeview.is-selected .annotation-block {
  border-color: var(--pb-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--pb-primary) 15%, transparent);
}

.annotation-block-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px dashed var(--pb-divider);
  margin-bottom: 0.5rem;
  background: var(--pb-surface-subtle);
  border-top-left-radius: var(--pb-radius-md);
  border-top-right-radius: var(--pb-radius-md);
}

.annotation-block-toolbar-left,
.annotation-block-toolbar-right {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--pb-text-muted);
}

.annotation-block-toolbar-divider {
  opacity: 0.5;
}

.annotation-block-toolbar-label {
  font-weight: 600;
  color: var(--pb-text);
}

.annotation-block-lang-select {
  padding: 0.15rem 0.4rem;
  border-radius: var(--pb-radius-sm);
  border: 1px solid var(--pb-divider);
  background: var(--pb-surface);
  font-size: 0.75rem;
  color: var(--pb-text);
}

.annotation-block-action {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.55rem;
  border-radius: var(--pb-radius-sm);
  border: 1px solid var(--pb-primary);
  background: var(--pb-primary);
  color: var(--pb-primary-contrast);
  font-size: 0.75rem;
  cursor: pointer;
}

.annotation-block-action:hover:not(:disabled) {
  background: var(--pb-primary-hover);
}

.annotation-block-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.annotation-block-action.is-ghost {
  background: transparent;
  color: var(--pb-text-muted);
  border-color: var(--pb-divider);
}

.annotation-block-action.is-ghost:hover:not(:disabled) {
  background: var(--pb-surface-subtle);
  color: var(--pb-text);
}
</style>
