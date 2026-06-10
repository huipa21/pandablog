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
          <span class="annotation-block-toolbar-label">{{ t('admin.editor.nodeViews.annotation') }}</span>
          <span class="annotation-block-toolbar-divider">·</span>
          <select
            class="annotation-block-lang-select"
            :value="lang"
            :disabled="busy"
            @change="onLangChange"
          >
            <option value="cmn">{{ t('admin.editor.nodeViews.mandarinPinyin') }}</option>
            <option value="yue">{{ t('admin.editor.nodeViews.cantoneseJyutping') }}</option>
            <option value="jpn">{{ t('admin.editor.nodeViews.japaneseFurigana') }}</option>
          </select>
        </div>

        <div class="annotation-block-toolbar-right">
          <button
            type="button"
            class="annotation-block-action"
            :class="{ 'is-active': annotateActive }"
            :disabled="primaryDisabled"
            :aria-pressed="annotateActive"
            :title="primaryTitle"
            @click="onPrimaryClick"
          >
            <UIcon :name="primaryIcon" class="size-3.5" />
            <span>{{ busy ? t('admin.editor.nodeViews.annotating') : primaryLabel }}</span>
          </button>
        </div>
      </div>

      <NodeViewContent as="div" class="annotation-block-content" />
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Fragment } from '@tiptap/pm/model'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { useReadings } from '~/composables/editor/useReadings'
import { DEFAULT_ANNOT_LANG, isAnnotLang, type AnnotLang } from '~/extensions/rubyUnit'
import {
  getRubyEditState,
  rubyEditPluginKey,
  setPendingRange
} from '~/extensions/rubyEditState'

const props = defineProps(nodeViewProps)

const { t } = useI18n()
const { annotate } = useReadings()

const busy = ref(false)
const rubyEditVersion = ref(0)

function refreshRubyEditState() {
  rubyEditVersion.value += 1
}

onMounted(() => {
  props.editor?.on('transaction', refreshRubyEditState)
})

onBeforeUnmount(() => {
  props.editor?.off('transaction', refreshRubyEditState)
})

const lang = computed<AnnotLang>(() => {
  const raw = props.node.attrs?.lang
  return isAnnotLang(raw) ? raw : DEFAULT_ANNOT_LANG
})

// Counts characters available for annotation. Includes both plain-text runs
// and existing `rubyUnit` atoms (counting their `base` length).
const annotatableLength = computed(() => {
  let length = 0
  props.node.descendants((child) => {
    if (child.isText) {
      length += (child.text ?? '').length
    } else if (child.type.name === 'rubyUnit') {
      length += String(child.attrs?.base ?? '').length
    }
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

// ---- Toolbar toggle state ----
// The primary button is a stateful toggle:
//   * "active" (highlighted) when the scope already has annotations.
//   * Click while active → strip annotations back to plain text.
//   * Click while inactive → run the engine on the scope using the current
//     language. If a pending range is waiting (from a previous strip), the
//     click annotates THAT range; otherwise it annotates the whole block.
// Switching the language selector while annotations exist re-runs the
// engine immediately so readings reflect the new language (the same
// character can have different cmn / yue / jpn readings).

const blockPos = computed<number | null>(() => {
  const fn = props.getPos
  if (typeof fn !== 'function') return null
  const pos = fn()
  return typeof pos === 'number' ? pos : null
})

const blockEnd = computed<number | null>(() => {
  const start = blockPos.value
  if (start === null) return null
  return start + props.node.nodeSize
})

const editState = computed(() => {
  const _rubyEditVersion = rubyEditVersion.value
  const editor = props.editor
  if (!editor) return null
  return getRubyEditState(editor.state)
})

const selectedInBlock = computed<number[]>(() => {
  const state = editState.value
  const start = blockPos.value
  const end = blockEnd.value
  if (!state || start === null || end === null) return []
  return state.selectedPositions.filter((pos) => pos > start && pos < end)
})

const pendingRangeInBlock = computed(() => {
  const state = editState.value
  const start = blockPos.value
  const end = blockEnd.value
  if (!state || !state.pendingRange || start === null || end === null) return null
  const { from, to } = state.pendingRange
  if (from <= start || to >= end) return null
  return state.pendingRange
})

const actionMode = computed<'annotate-all' | 'reannotate-all' | 'strip-selected' | 'annotate-selected' | 'strip-all'>(() => {
  if (pendingRangeInBlock.value) return 'annotate-selected'
  if (selectedInBlock.value.length > 0) return 'strip-selected'
  if (rubyCount.value > 0) return 'strip-all'
  return 'annotate-all'
})

// Active = the scope currently shows annotations. The pending range counts
// as "needs annotating" (text already stripped, awaiting engine), so the
// button is NOT active in that state — clicking will annotate it.
const annotateActive = computed(() => {
  if (pendingRangeInBlock.value) return false
  if (selectedInBlock.value.length > 0) return true
  return rubyCount.value > 0
})

const primaryLabel = computed(() => {
  if (selectedInBlock.value.length > 0) return t('admin.editor.nodeViews.stripSelected')
  return t('admin.editor.nodeViews.annotate')
})

const primaryIcon = computed(() => {
  if (selectedInBlock.value.length > 0) return 'i-lucide-eraser'
  return 'i-lucide-wand-sparkles'
})

const primaryTitle = computed(() => {
  if (busy.value) return t('admin.editor.nodeViews.annotating')
  if (pendingRangeInBlock.value) return t('admin.editor.nodeViews.annotateStrippedText', { lang: lang.value })
  if (selectedInBlock.value.length > 0) return t('admin.editor.nodeViews.stripSelectedTitle')
  if (rubyCount.value > 0) return t('admin.editor.nodeViews.stripAllTitle')
  return t('admin.editor.nodeViews.annotateText', { lang: lang.value })
})

const primaryDisabled = computed(() => {
  if (busy.value) return true
  if (pendingRangeInBlock.value) return false
  if (selectedInBlock.value.length > 0) return false
  // Strip-all needs rubies; annotate-all needs annotatable text.
  if (rubyCount.value > 0) return false
  return annotatableLength.value === 0
})

function onPrimaryClick() {
  if (busy.value) return
  switch (actionMode.value) {
    case 'annotate-selected': return annotateSelected()
    case 'strip-selected': return stripSelected()
    case 'strip-all': return stripAll()
    default: return annotateAll()
  }
}

async function onLangChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const next = target.value
  if (!isAnnotLang(next)) return
  if (next === lang.value) return
  props.updateAttributes({ lang: next })

  const editor = props.editor
  if (!editor) return

  // The same character can have different readings in cmn / yue / jpn, so
  // updating the lang attribute alone is not enough — we must re-run the
  // engine on every existing ruby in the block.
  if (rubyCount.value > 0 && !busy.value) {
    await annotateAll(next)
    return
  }

  // No rubies, but a pending range may be waiting from a previous strip.
  // Update its lang so the next "Annotate" click uses the new engine.
  const pending = pendingRangeInBlock.value
  if (pending && pending.lang !== next) {
    setPendingRange(editor.view, { ...pending, lang: next })
  }
}

async function annotateAll(forceLang?: AnnotLang) {
  if (busy.value) return
  const editor = props.editor
  if (!editor) return

  const pos = props.getPos?.()
  if (typeof pos !== 'number') return

  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'annotationBlock') return

  const targetLang: AnnotLang = forceLang ?? lang.value

  // Collect plain-text runs (skip existing rubyUnit + other inline nodes).
  const text = collectPlainText(node)
  if (!text) return

  busy.value = true
  try {
    const segments = await annotate(text, targetLang)
    if (segments.length === 0) return

    const schema = editor.state.schema
    const rubyType = schema.nodes.rubyUnit
    if (!rubyType) return

    const fragmentNodes = segments.flatMap((segment) => {
      if (segment.kind === 'ruby') {
        return [rubyType.create({ base: segment.base, reading: segment.reading, lang: targetLang })]
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
    // The whole block was rebuilt — drop any leftover pending range so the
    // next click goes through the normal toggle flow.
    tr.setMeta(rubyEditPluginKey, { type: 'set-pending', pending: null })
    editor.view.dispatch(tr)
  } catch (error) {
    console.error('[annotation-block] annotate failed', error)
  } finally {
    busy.value = false
  }
}

// Strip every ruby atom in the block back to plain text. Used when the user
// clicks the toggle while it is "active" with no multi-selection.
function stripAll() {
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
  // Stripping the whole block clears any in-flight pending range so the
  // next click annotates the block in one shot.
  tr.setMeta(rubyEditPluginKey, { type: 'set-pending', pending: null })
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

// Strip the rubies at the user's multi-selected positions back to plain text
// and remember the resulting text range so the next click of the primary
// button re-runs the engine on it. We process positions right-to-left so
// each replacement does not invalidate the earlier ones.
function stripSelected() {
  const editor = props.editor
  if (!editor) return
  const start = blockPos.value
  if (start === null) return
  const positions = selectedInBlock.value.slice().sort((a, b) => a - b)
  if (positions.length === 0) return

  const tr = editor.state.tr
  const replacedRanges: Array<{ from: number, to: number }> = []
  for (let i = positions.length - 1; i >= 0; i -= 1) {
    const pos = positions[i]
    if (pos === undefined) continue
    const node = editor.state.doc.nodeAt(pos)
    if (!node || node.type.name !== 'rubyUnit') continue
    const baseText = String(node.attrs?.base ?? '')
    if (!baseText) continue
    // Map through prior steps so `pos` still points at the correct atom.
    const mapped = tr.mapping.map(pos)
    tr.replaceWith(mapped, mapped + node.nodeSize, editor.state.schema.text(baseText))
    replacedRanges.unshift({ from: pos, to: pos + node.nodeSize })
  }

  if (replacedRanges.length === 0) return

  // After dispatch, project replacedRanges through the same transaction's
  // accumulated mapping so the recorded positions reflect the final doc.
  const mapping = tr.mapping
  const finalFromCandidates: number[] = []
  const finalToCandidates: number[] = []
  for (const range of replacedRanges) {
    finalFromCandidates.push(mapping.map(range.from, -1))
    finalToCandidates.push(mapping.map(range.to, 1))
  }
  const finalFrom = Math.min(...finalFromCandidates)
  const finalTo = Math.max(...finalToCandidates)

  tr.setMeta('addToHistory', true)
  tr.setMeta(rubyEditPluginKey, { type: 'set-pending', pending: { from: finalFrom, to: finalTo, lang: lang.value } })
  editor.view.dispatch(tr)
}

async function annotateSelected() {
  if (busy.value) return
  const editor = props.editor
  if (!editor) return
  const pending = pendingRangeInBlock.value
  if (!pending) return

  const text = editor.state.doc.textBetween(pending.from, pending.to, '\n', '')
  if (!text) {
    setPendingRange(editor.view, null)
    return
  }

  busy.value = true
  try {
    const segments = await annotate(text, pending.lang)
    if (segments.length === 0) {
      setPendingRange(editor.view, null)
      return
    }

    const schema = editor.state.schema
    const rubyType = schema.nodes.rubyUnit
    if (!rubyType) return

    const fragmentNodes = segments.flatMap((segment) => {
      if (segment.kind === 'ruby') {
        return [rubyType.create({ base: segment.base, reading: segment.reading, lang: pending.lang })]
      }
      if (segment.text) {
        return [schema.text(segment.text)]
      }
      return []
    })

    if (fragmentNodes.length === 0) {
      setPendingRange(editor.view, null)
      return
    }

    const tr = editor.state.tr
    tr.replaceWith(pending.from, pending.to, Fragment.fromArray(fragmentNodes))
    tr.setMeta('addToHistory', true)
    tr.setMeta(rubyEditPluginKey, { type: 'set-pending', pending: null })
    editor.view.dispatch(tr)
  } catch (error) {
    console.error('[annotation-block] annotate selected failed', error)
  } finally {
    busy.value = false
  }
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
  border: 1px solid var(--pb-divider);
  background: var(--pb-surface);
  color: var(--pb-text);
  font-size: 0.75rem;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}

.annotation-block-action:hover:not(:disabled) {
  background: var(--pb-surface-subtle);
  border-color: color-mix(in srgb, var(--pb-primary) 40%, var(--pb-divider));
}

.annotation-block-action.is-active {
  background: var(--pb-primary);
  color: var(--pb-primary-contrast);
  border-color: var(--pb-primary);
}

.annotation-block-action.is-active:hover:not(:disabled) {
  background: var(--pb-primary-hover);
  border-color: var(--pb-primary-hover);
}

.annotation-block-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Pending re-annotation highlight — applied by the rubyEditState plugin as a
   ProseMirror inline decoration over the text range left behind after the
   user strips a multi-selection of rubies. The next click of the primary
   button re-feeds that text to the annotation engine. */
:deep(.ProseMirror) .ruby-pending-annotation {
  background: color-mix(in srgb, var(--pb-primary) 12%, transparent);
  border-radius: var(--pb-radius-sm);
  box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--pb-primary) 35%, transparent);
}
</style>
