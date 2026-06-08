<template>
  <NodeViewWrapper
    as="span"
    class="ruby-unit-nodeview"
    :class="{ 'is-selected': selected, 'is-multi-selected': multiSelected }"
    :data-lang="lang"
    :data-multi-selected="multiSelected ? 'true' : 'false'"
  >
    <ruby class="ruby-unit" :data-lang="lang" @click.stop="onClick" @dblclick.stop="onDoubleClick"><span class="ruby-base">{{ base }}</span><rt>{{ reading || '\u00a0' }}</rt></ruby>

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
        @keydown.stop
        @keydown.enter.prevent="closePopover"
        @keydown.esc.prevent="closePopover"
      >
      <span class="ruby-unit-popover-actions">
        <button type="button" class="ruby-unit-popover-action" @click="clearReading">Clear</button>
        <button
          type="button"
          class="ruby-unit-popover-action"
          :disabled="restoreBusy || !base"
          @click="restoreReading"
        >
          {{ restoreBusy ? 'Restoring…' : 'Restore' }}
        </button>
        <button type="button" class="ruby-unit-popover-action is-primary" @click="closePopover">Done</button>
      </span>
    </span>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/vue-3'
import { useReadings } from '~/composables/editor/useReadings'
import { DEFAULT_ANNOT_LANG, isAnnotLang, type AnnotLang } from '~/extensions/rubyUnit'
import {
  collectRangePositions,
  findRubyOwnerBlock,
  getRubyEditState,
  rubyEditPluginKey,
  setMultiSelection,
  setOpenPopover,
  togglePosition
} from '~/extensions/rubyEditState'

const props = defineProps<NodeViewProps>()

const { annotate } = useReadings()

const readingInputEl = ref<HTMLInputElement | null>(null)
const rubyEditVersion = ref(0)
const restoreBusy = ref(false)

function refreshRubyEditState() {
  rubyEditVersion.value += 1
}

onMounted(() => {
  props.editor?.on('transaction', refreshRubyEditState)
})

onBeforeUnmount(() => {
  props.editor?.off('transaction', refreshRubyEditState)
})

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

// Single source of truth lives in the rubyEditState plugin. We read it via
// the editor's current state. The version ref below makes plugin-only
// transactions reactive for Vue NodeViews (those transactions do not change
// this node's document content, so Vue would otherwise keep stale computeds).
const editState = computed(() => {
  const _rubyEditVersion = rubyEditVersion.value
  const editor = props.editor
  if (!editor) return null
  return getRubyEditState(editor.state)
})

const myPos = computed<number | null>(() => {
  const fn = props.getPos
  if (typeof fn !== 'function') return null
  const pos = fn()
  return typeof pos === 'number' ? pos : null
})

const popoverOpen = computed(() => {
  const state = editState.value
  const pos = myPos.value
  if (!state || pos === null) return false
  return state.openPopoverPos === pos
})

const multiSelected = computed(() => {
  const state = editState.value
  const pos = myPos.value
  if (!state || pos === null) return false
  return state.selectedPositions.includes(pos)
})

watch(popoverOpen, async (open) => {
  if (!open) return
  await nextTick()
  readingInputEl.value?.focus()
  readingInputEl.value?.select()
})

function onClick(event: MouseEvent) {
  const editor = props.editor
  if (!editor || !editor.isEditable) return
  const pos = myPos.value
  if (pos === null) return
  const blockPos = findRubyOwnerBlock(editor.state, pos)

  if (event.metaKey || event.ctrlKey) {
    togglePosition(editor.view, pos, blockPos)
    return
  }

  if (event.shiftKey) {
    const state = getRubyEditState(editor.state)
    const anchor = state.anchorPosition ?? pos
    if (blockPos !== null) {
      const positions = collectRangePositions(editor.state, blockPos, anchor, pos)
      setMultiSelection(editor.view, positions, anchor, blockPos)
    } else {
      setMultiSelection(editor.view, [pos], pos, blockPos)
    }
    return
  }

  // Plain click — replace selection with this single ruby and (re)set anchor.
  setMultiSelection(editor.view, [pos], pos, blockPos)
}

function onDoubleClick() {
  const editor = props.editor
  if (!editor || !editor.isEditable) return
  const pos = myPos.value
  if (pos === null) return
  // Toggle: dbl-clicking the same ruby twice closes the popover.
  const state = getRubyEditState(editor.state)
  if (state.openPopoverPos === pos) {
    setOpenPopover(editor.view, null)
  } else {
    setOpenPopover(editor.view, pos)
  }
}

function closePopover() {
  const editor = props.editor
  if (!editor) return
  setOpenPopover(editor.view, null)
}

function onReadingInput(event: Event) {
  const target = event.target as HTMLInputElement
  updateReading(target.value)
}

function clearReading() {
  updateReading('')
}

async function restoreReading() {
  if (restoreBusy.value) return

  const sourceBase = base.value
  const sourceLang = lang.value
  if (!sourceBase) return

  restoreBusy.value = true
  try {
    const segments = await annotate(sourceBase, sourceLang)
    const exactRuby = segments.find((segment) => segment.kind === 'ruby' && segment.base === sourceBase)
    if (exactRuby?.kind === 'ruby') {
      updateReading(exactRuby.reading)
      return
    }

    const generatedReading = segments
      .flatMap((segment) => (segment.kind === 'ruby' && segment.reading ? [segment.reading] : []))
      .join(sourceLang === 'jpn' ? '' : ' ')
    updateReading(generatedReading)
  } catch (error) {
    console.error('[ruby-unit] restore reading failed', error)
  } finally {
    restoreBusy.value = false
  }
}

function updateReading(nextReading: string) {
  const editor = props.editor
  const pos = myPos.value
  if (!editor || pos === null) {
    props.updateAttributes({ reading: nextReading })
    return
  }

  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'rubyUnit') {
    props.updateAttributes({ reading: nextReading })
    return
  }

  const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    reading: nextReading
  })
  tr.setMeta(rubyEditPluginKey, { type: 'set-popover', position: pos })
  editor.view.dispatch(tr)
}
</script>

<style scoped>
.ruby-unit-nodeview {
  position: relative;
  display: inline;
}

/* Visuals must mirror components/content/NodeRubyUnit.vue — what you see in the
   editor must equal what the reader sees on the published post.
   We deliberately do NOT set `display: inline-block` here: that overrides the
   browser's implicit `display: ruby` and disables `ruby-align: center`,
   causing wider readings (e.g. jyutping `gwong2`) to push the base to the
   start edge. Native ruby layout already handles centring per base unit. */
.ruby-unit {
  ruby-position: over;
  ruby-align: center;
  line-height: 1.85;
  padding-inline: 0.18em;
  cursor: pointer;
}

.ruby-unit > .ruby-base {
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
  letter-spacing: 0.04em;
}

.ruby-unit[data-lang='yue'] > rt {
  font-family: ui-sans-serif, system-ui, -apple-system, 'PingFang HK', 'Microsoft YaHei', sans-serif;
  color: var(--pb-link);
  letter-spacing: 0.04em;
}

.ruby-unit[data-lang='jpn'] > rt {
  font-family: ui-sans-serif, system-ui, -apple-system, 'Hiragino Sans', 'Yu Gothic UI', 'Noto Sans JP', sans-serif;
  color: var(--pb-text-muted);
}

.ruby-unit-nodeview.is-selected ruby {
  outline: 2px solid var(--pb-primary);
  border-radius: var(--pb-radius-sm);
}

/* Multi-select highlight — driven by rubyEditState plugin via class binding
   on the wrapper, and by a ProseMirror node decoration (`ruby-multi-selected`)
   so the highlight survives even if Vue reactivity is briefly out of sync. */
.ruby-unit-nodeview.is-multi-selected ruby,
.ProseMirror .ruby-multi-selected {
  outline: 2px solid var(--pb-primary);
  outline-offset: 2px;
  border-radius: var(--pb-radius-sm);
  background: color-mix(in srgb, var(--pb-primary) 8%, transparent);
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

.ruby-unit-popover-action:hover:not(:disabled) {
  background: var(--pb-surface-subtle);
}

.ruby-unit-popover-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ruby-unit-popover-action.is-primary {
  background: var(--pb-primary);
  color: var(--pb-primary-contrast);
  border-color: var(--pb-primary);
}

.ruby-unit-popover-action.is-primary:hover:not(:disabled) {
  background: var(--pb-primary-hover);
}
</style>
