<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="toolbarEl"
      class="block-toolbar"
      :style="dragStyle ?? floatingStyles"
      contenteditable="false"
      data-testid="block-popup-toolbar"
    >
      <!-- Drag grip -->
      <button
        type="button"
        class="bt-btn cursor-grab active:cursor-grabbing touch-none"
        :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
        title="Drag toolbar"
        @mousedown.prevent="onDragHandleMouseDown"
      >
        <svg width="10" height="16" viewBox="0 0 10 16" class="pointer-events-none opacity-40">
          <circle cx="3" cy="3" r="1.5" fill="currentColor" />
          <circle cx="7" cy="3" r="1.5" fill="currentColor" />
          <circle cx="3" cy="8" r="1.5" fill="currentColor" />
          <circle cx="7" cy="8" r="1.5" fill="currentColor" />
          <circle cx="3" cy="13" r="1.5" fill="currentColor" />
          <circle cx="7" cy="13" r="1.5" fill="currentColor" />
        </svg>
      </button>
      <div class="bt-separator" />

      <!-- Block-level actions (always visible when toolbar is shown) -->
      <UDropdownMenu :items="transformItems">
        <button type="button" class="bt-btn" title="Transform to...">
          <UIcon :name="currentIcon" class="size-4" />
          <UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" />
        </button>
      </UDropdownMenu>

      <button type="button" class="bt-btn" title="Move up" @click="emit('move-up')">
        <UIcon name="i-lucide-arrow-up" class="size-4" />
      </button>
      <button type="button" class="bt-btn" title="Move down" @click="emit('move-down')">
        <UIcon name="i-lucide-arrow-down" class="size-4" />
      </button>

      <UDropdownMenu :items="alignItems">
        <button type="button" class="bt-btn" title="Align">
          <UIcon :name="alignIcon" class="size-4" />
          <UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" />
        </button>
      </UDropdownMenu>

      <!-- Inline formatting section (always visible) -->
      <div class="bt-separator" />

      <button
        type="button"
        class="bt-btn"
        :class="{ 'bt-btn-active': inlineActive.bold }"
        :aria-pressed="inlineActive.bold"
        title="Bold"
        @mousedown.prevent="toggleInlineMark('bold')"
      >
        <UIcon name="i-lucide-bold" class="size-4" />
      </button>
      <button
        type="button"
        class="bt-btn"
        :class="{ 'bt-btn-active': inlineActive.italic }"
        :aria-pressed="inlineActive.italic"
        title="Italic"
        @mousedown.prevent="toggleInlineMark('italic')"
      >
        <UIcon name="i-lucide-italic" class="size-4" />
      </button>
      <button
        type="button"
        class="bt-btn"
        :class="{ 'bt-btn-active': inlineActive.strike }"
        :aria-pressed="inlineActive.strike"
        title="Strikethrough"
        @mousedown.prevent="toggleInlineMark('strike')"
      >
        <UIcon name="i-lucide-strikethrough" class="size-4" />
      </button>
      <button
        type="button"
        class="bt-btn"
        :class="{ 'bt-btn-active': inlineActive.link }"
        :aria-pressed="inlineActive.link"
        title="Link"
        @mousedown.prevent="openLinkDialog"
      >
        <UIcon name="i-lucide-link" class="size-4" />
      </button>

      <div class="relative">
        <button
          type="button"
          class="bt-btn"
          :class="{ 'bt-btn-active': inlineActive.highlight }"
          :aria-pressed="inlineActive.highlight"
          title="Highlight"
          @mousedown.prevent="toggleHighlightPalette"
        >
          <UIcon name="i-lucide-highlighter" class="size-4" />
        </button>

        <div
          v-if="highlightPaletteOpen"
          class="bt-highlight-popover"
          role="dialog"
          aria-label="Highlight colors"
          @mousedown.prevent
        >
          <div class="bt-highlight-grid">
            <button
              v-for="color in highlightColors"
              :key="color.value"
              type="button"
              class="bt-highlight-swatch"
              :style="{ backgroundColor: color.value }"
              :title="`Highlight ${color.label}`"
              :aria-label="`Highlight ${color.label}`"
              @mousedown.prevent="setHighlightColor(color.value)"
            />
          </div>

          <div class="bt-highlight-actions">
            <label class="bt-highlight-picker" title="Custom highlight color">
              <UIcon name="i-lucide-palette" class="size-3.5" />
              <span>Custom</span>
              <input type="color" :value="customHighlightColor" @input="setCustomHighlightColor">
            </label>

            <button
              type="button"
              class="bt-highlight-clear"
              title="Remove highlight"
              @mousedown.prevent="unsetHighlightColor"
            >
              <UIcon name="i-lucide-eraser" class="size-3.5" />
              <span>Transparent</span>
            </button>
          </div>
        </div>
      </div>

      <UDropdownMenu :items="inlineMoreItems">
        <button
          type="button"
          class="bt-btn"
          :class="{ 'bt-btn-active': hasDropdownInlineActive }"
          :aria-pressed="hasDropdownInlineActive"
          title="More formatting"
        >
          <UIcon name="i-lucide-chevron-down" class="size-4" />
        </button>
      </UDropdownMenu>

      <!-- 3-dot More menu -->
      <UDropdownMenu :items="moreItems">
        <button type="button" class="bt-btn" title="More options">
          <UIcon name="i-lucide-more-vertical" class="size-4" />
        </button>
      </UDropdownMenu>
    </div>
  </Teleport>

  <UModal v-model:open="linkDialogOpen">
    <template #content>
      <UCard>
        <template #header>
          <div>
            <h3 class="text-base font-semibold text-stone-900">Edit link</h3>
            <p class="text-xs text-stone-500">Set URL, display text, and how the link should open.</p>
          </div>
        </template>

        <div class="grid gap-3">
          <UFormField label="URL">
            <UInput v-model="linkForm.href" placeholder="https://example.com" autofocus />
          </UFormField>
          <UFormField label="Display text">
            <UInput v-model="linkForm.text" placeholder="Link text" />
          </UFormField>
          <UFormField label="Open behavior">
            <USelect v-model="linkForm.openMode" :items="linkOpenModeItems" />
          </UFormField>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton type="button" variant="ghost" color="neutral" @click="linkDialogOpen = false">Cancel</UButton>
            <UButton type="button" color="primary" @click="applyLinkDialog">Apply</UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue'
import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import type { CSSProperties } from 'vue'
import { hasAnyDropdownInlineActive, inlineMenuLabel } from './inlineFormatting'
import { DEFAULT_HIGHLIGHT_COLOR, HIGHLIGHT_COLORS } from '~/utils/highlightColors'

const props = defineProps<{
  editor: Editor | null
  referenceEl: HTMLElement | null
  visible: boolean
  blockType: string | null
  hasTextSelection: boolean
  selectionTick: number
  lastTextSelection: { from: number; to: number } | null
}>()

const emit = defineEmits<{
  'move-up': []
  'move-down': []
  duplicate: []
  delete: []
  'copy-block': []
  'cut-block': []
  'add-before': []
  'add-after': []
  'edit-html': []
  'add-footnote': []
  transform: [type: string]
}>()

const toolbarEl = ref<HTMLElement | null>(null)
const refEl = computed(() => props.referenceEl)
const linkDialogOpen = ref(false)
const linkDialogRange = ref<{ from: number; to: number } | null>(null)
const highlightPaletteOpen = ref(false)
const customHighlightColor = ref(DEFAULT_HIGHLIGHT_COLOR)
const highlightColors = HIGHLIGHT_COLORS
let pendingHighlightRange: { from: number; to: number } | null = null

// ─── FREE DRAG ────────────────────────────────────────────────────────────────
const dragging = ref(false)
const dragStyle = ref<CSSProperties | null>(null)
let dragOffsetX = 0
let dragOffsetY = 0

function onDragHandleMouseDown(event: MouseEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  const el = toolbarEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  // If not yet pinned, pin at current float position first
  if (!dragStyle.value) {
    dragStyle.value = { position: 'fixed', top: `${rect.top}px`, left: `${rect.left}px`, transform: 'none' }
  }
  dragOffsetX = event.clientX - rect.left
  dragOffsetY = event.clientY - rect.top
  dragging.value = true
  window.addEventListener('mousemove', onDragMouseMove)
  window.addEventListener('mouseup', onDragMouseUp)
}

function onDragMouseMove(event: MouseEvent) {
  if (!dragging.value) return
  const x = Math.max(0, Math.min(event.clientX - dragOffsetX, window.innerWidth - 40))
  const y = Math.max(0, Math.min(event.clientY - dragOffsetY, window.innerHeight - 40))
  dragStyle.value = { position: 'fixed', top: `${y}px`, left: `${x}px`, transform: 'none' }
}

function onDragMouseUp() {
  dragging.value = false
  window.removeEventListener('mousemove', onDragMouseMove)
  window.removeEventListener('mouseup', onDragMouseUp)
}

// Reset drag position when the toolbar's reference block changes
watch(() => props.referenceEl, () => {
  dragStyle.value = null
  dragging.value = false
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onDragMouseMove)
  window.removeEventListener('mouseup', onDragMouseUp)
  window.removeEventListener('pointerdown', closeHighlightPaletteOnOutsideClick)
})
const linkForm = reactive({
  href: 'https://',
  text: '',
  openMode: 'same-tab' as 'same-tab' | 'new-tab' | 'new-window'
})

const linkOpenModeItems = [
  { label: 'Open in same tab', value: 'same-tab' },
  { label: 'Open in new tab', value: 'new-tab' },
  { label: 'Open in new window', value: 'new-window' }
]

const { floatingStyles } = useFloating(refEl, toolbarEl, {
  placement: 'top-start',
  middleware: [offset(8), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate
})

const currentIcon = computed(() => {
  switch (props.blockType) {
    case 'heading': return 'i-lucide-heading'
    case 'paragraph': return 'i-lucide-pilcrow'
    case 'bulletList': return 'i-lucide-list'
    case 'orderedList': return 'i-lucide-list-ordered'
    case 'blockquote': return 'i-lucide-quote'
    case 'codeBlock': return 'i-lucide-square-code'
    case 'diffBlock': return 'i-lucide-git-compare-arrows'
    case 'horizontalRule': return 'i-lucide-minus'
    case 'image': return 'i-lucide-image'
    case 'mediaText': return 'i-lucide-panel-left'
    case 'columnsBlock': return 'i-lucide-columns-3'
    case 'tabsBlock': return 'i-lucide-panel-top'
    case 'customHtml': return 'i-lucide-file-code-2'
    case 'mermaid': return 'i-lucide-git-fork'
    default: return 'i-lucide-box'
  }
})

const transformItems = computed(() => [[
  { label: 'Paragraph', icon: 'i-lucide-pilcrow', onSelect: () => emit('transform', 'paragraph') },
  { label: 'Heading 1', icon: 'i-lucide-heading-1', onSelect: () => emit('transform', 'heading-1') },
  { label: 'Heading 2', icon: 'i-lucide-heading-2', onSelect: () => emit('transform', 'heading-2') },
  { label: 'Heading 3', icon: 'i-lucide-heading-3', onSelect: () => emit('transform', 'heading-3') },
  { label: 'Bullet list', icon: 'i-lucide-list', onSelect: () => emit('transform', 'bulletList') },
  { label: 'Numbered list', icon: 'i-lucide-list-ordered', onSelect: () => emit('transform', 'orderedList') },
  { label: 'Quote', icon: 'i-lucide-quote', onSelect: () => emit('transform', 'blockquote') },
  { label: 'Code', icon: 'i-lucide-square-code', onSelect: () => emit('transform', 'codeBlock') },
  { label: 'Separator', icon: 'i-lucide-minus', onSelect: () => emit('transform', 'horizontalRule') }
]])

const alignIcon = computed(() => {
  const ed = props.editor
  if (!ed) return 'i-lucide-align-left'
  if (ed.isActive({ textAlign: 'center' })) return 'i-lucide-align-center'
  if (ed.isActive({ textAlign: 'right' })) return 'i-lucide-align-right'
  if (ed.isActive({ textAlign: 'justify' })) return 'i-lucide-align-justify'
  return 'i-lucide-align-left'
})

const alignItems = computed(() => [[
  { label: 'Align left', icon: 'i-lucide-align-left', onSelect: () => setAlign('left') },
  { label: 'Align center', icon: 'i-lucide-align-center', onSelect: () => setAlign('center') },
  { label: 'Align right', icon: 'i-lucide-align-right', onSelect: () => setAlign('right') },
  { label: 'Justify', icon: 'i-lucide-align-justify', onSelect: () => setAlign('justify') }
]])

const moreItems = computed(() => [[
  { label: 'Copy', icon: 'i-lucide-clipboard-copy', onSelect: () => emit('copy-block') },
  { label: 'Cut', icon: 'i-lucide-scissors', onSelect: () => emit('cut-block') },
  { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: () => emit('duplicate') }
], [
  { label: 'Add before', icon: 'i-lucide-arrow-up-to-line', onSelect: () => emit('add-before') },
  { label: 'Add after', icon: 'i-lucide-arrow-down-to-line', onSelect: () => emit('add-after') }
], [
  { label: 'Edit as HTML', icon: 'i-lucide-file-code-2', onSelect: () => emit('edit-html') }
], [
  { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete') }
]])

const inlineActive = computed(() => {
  // Force recomputation whenever BlockEditor reports selection/transaction changes.
  void props.selectionTick
  const ed = props.editor
  if (!ed) {
    return {
      bold: false,
      italic: false,
      strike: false,
      code: false,
      highlight: false,
      link: false,
      subscript: false,
      superscript: false
    }
  }

  return {
    bold: selectionHasMark(ed, 'bold'),
    italic: selectionHasMark(ed, 'italic'),
    strike: selectionHasMark(ed, 'strike'),
    code: selectionHasMark(ed, 'code'),
    highlight: selectionHasMark(ed, 'highlight'),
    link: selectionHasMark(ed, 'link'),
    subscript: selectionHasMark(ed, 'subscript'),
    superscript: selectionHasMark(ed, 'superscript')
  }
})

const inlineMoreItems = computed(() => [
  [
    {
      label: inlineMenuLabel('Inline code', inlineActive.value.code),
      icon: 'i-lucide-code',
      class: inlineActive.value.code ? 'bg-teal-50 text-teal-700' : undefined,
      onSelect: () => toggleInlineMark('code')
    }
  ],
  [
    {
      label: inlineMenuLabel('Subscript', inlineActive.value.subscript),
      icon: 'i-lucide-subscript',
      class: inlineActive.value.subscript ? 'bg-teal-50 text-teal-700' : undefined,
      onSelect: () => toggleInlineMark('subscript')
    },
    {
      label: inlineMenuLabel('Superscript', inlineActive.value.superscript),
      icon: 'i-lucide-superscript',
      class: inlineActive.value.superscript ? 'bg-teal-50 text-teal-700' : undefined,
      onSelect: () => toggleInlineMark('superscript')
    },
    { label: 'Footnote', icon: 'i-lucide-footprints', onSelect: () => emit('add-footnote') }
  ]
])

const hasDropdownInlineActive = computed(() => hasAnyDropdownInlineActive(inlineActive.value))

function setAlign(value: 'left' | 'center' | 'right' | 'justify') {
  const ed = props.editor
  if (!ed) return
  ;(ed.chain().focus() as any).setTextAlign(value).run()
}

function openLinkDialog() {
  const editor = props.editor
  if (!editor) return

  if (editor.state.selection.empty) {
    if (!selectionHasMark(editor, 'link')) {
      return
    }

    editor.chain().focus().extendMarkRange('link').run()
  }

  const { from, to, empty } = editor.state.selection
  if (from === to) {
    return
  }

  const previousHref = editor.getAttributes('link').href as string | undefined
  const previousTarget = editor.getAttributes('link').target as string | null | undefined
  const previousOpenMode = editor.getAttributes('link').openMode as string | undefined
  const selectedText = empty ? '' : editor.state.doc.textBetween(from, to, ' ', ' ').trim()

  linkDialogRange.value = { from, to }
  linkForm.href = previousHref?.trim() || 'https://'
  linkForm.text = selectedText || previousHref?.trim() || ''
  linkForm.openMode = previousOpenMode === 'new-window' || previousOpenMode === 'new-tab' || previousOpenMode === 'same-tab'
    ? previousOpenMode
    : (previousTarget === '_blank' ? 'new-tab' : 'same-tab')
  linkDialogOpen.value = true
}

function applyLinkDialog() {
  const editor = props.editor
  if (!editor) return

  const href = linkForm.href.trim()
  if (!href) {
    linkDialogOpen.value = false
    linkDialogRange.value = null
    return
  }

  const range = linkDialogRange.value ?? (editor.state.selection.empty ? null : { from: editor.state.selection.from, to: editor.state.selection.to })
  if (!range || range.from === range.to) {
    linkDialogOpen.value = false
    linkDialogRange.value = null
    return
  }

  const selectedText = editor.state.doc.textBetween(range.from, range.to, ' ', ' ')
  const displayText = (linkForm.text || selectedText || href).trim()
  const openMode = linkForm.openMode
  const markAttrs: Record<string, unknown> = {
    href,
    target: openMode === 'same-tab' ? null : '_blank',
    rel: openMode === 'same-tab' ? 'noopener noreferrer nofollow' : 'noopener noreferrer',
    openMode
  }

  editor
    .chain()
    .focus()
    .insertContentAt({ from: range.from, to: range.to }, {
      type: 'text',
      text: displayText,
      marks: [{ type: 'link', attrs: markAttrs }]
    })
    .run()

  const cursor = range.from + displayText.length
  collapseToTextPosition(editor, cursor, { clearStoredMarks: true })
  linkDialogRange.value = null
  linkDialogOpen.value = false
}

function toggleInlineMark(mark: 'bold' | 'italic' | 'strike' | 'code' | 'highlight' | 'subscript' | 'superscript') {
  const ed = props.editor
  if (!ed) return

  const selectionEnd = ed.state.selection.to
  const hadRangeSelection = !ed.state.selection.empty
  const shouldClearAfterRange = mark !== 'code' && mark !== 'highlight'
  const chain = ed.chain().focus()

  switch (mark) {
    case 'bold':
      chain.toggleBold().run()
      break
    case 'italic':
      chain.toggleItalic().run()
      break
    case 'strike':
      chain.toggleStrike().run()
      break
    case 'code':
      chain.toggleCode().run()
      break
    case 'highlight':
      ;(chain as any).setHighlight({ color: DEFAULT_HIGHLIGHT_COLOR }).run()
      break
    case 'subscript':
      chain.unsetSuperscript().toggleSubscript().run()
      break
    case 'superscript':
      chain.unsetSubscript().toggleSuperscript().run()
      break
  }

  // After applying to a selected range, collapse to the end. Most marks clear
  // stored marks; code and highlight intentionally stay active until Tab.
  if (hadRangeSelection) {
    collapseToTextPosition(ed, selectionEnd, { clearStoredMarks: shouldClearAfterRange })
  }
}

function setHighlightColor(color: string) {
  const ed = props.editor
  if (!ed) return

  const currentSelection = ed.state.selection
  const range = normalizeRange(ed, pendingHighlightRange ?? (!currentSelection.empty ? { from: currentSelection.from, to: currentSelection.to } : null))
  const chain = ed.chain().focus()

  if (range) {
    chain.setTextSelection(range)
  }

  ;(chain as any).setHighlight({ color })

  if (range) {
    chain.setTextSelection(range.to)
  }

  chain.run()
  customHighlightColor.value = color

  pendingHighlightRange = null
  highlightPaletteOpen.value = false
}

function unsetHighlightColor() {
  const ed = props.editor
  if (!ed) return

  const currentSelection = ed.state.selection
  const range = normalizeRange(ed, pendingHighlightRange ?? (!currentSelection.empty ? { from: currentSelection.from, to: currentSelection.to } : null))
  const chain = ed.chain().focus()

  if (range) {
    chain.setTextSelection(range)
  }

  ;(chain as any).unsetHighlight()

  if (range) {
    chain.setTextSelection(range.to)
  }

  chain.run()

  if (range) {
    collapseToTextPosition(ed, range.to, { clearStoredMarks: true })
  }

  pendingHighlightRange = null
  highlightPaletteOpen.value = false
}

function toggleHighlightPalette() {
  const ed = props.editor
  if (!ed) {
    highlightPaletteOpen.value = !highlightPaletteOpen.value
    return
  }

  const { from, to, empty } = ed.state.selection
  const selectionEnd = to
  const isActive = selectionHasMark(ed, 'highlight')

  if (isActive) {
    ;(ed.chain().focus() as any).unsetHighlight().run()

    if (!empty) {
      collapseToTextPosition(ed, selectionEnd, { clearStoredMarks: true })
    }

    pendingHighlightRange = null
    highlightPaletteOpen.value = false
    return
  }

  pendingHighlightRange = empty ? null : { from, to }
  ;(ed.chain().focus() as any).setHighlight({ color: DEFAULT_HIGHLIGHT_COLOR }).run()

  if (!empty) {
    collapseToTextPosition(ed, selectionEnd, { clearStoredMarks: false })
  }

  customHighlightColor.value = DEFAULT_HIGHLIGHT_COLOR
  highlightPaletteOpen.value = true
}

function setCustomHighlightColor(event: Event) {
  const value = (event.target as HTMLInputElement).value
  customHighlightColor.value = value
  setHighlightColor(value)
}

function closeHighlightPaletteOnOutsideClick(event: PointerEvent) {
  if (!highlightPaletteOpen.value) {
    return
  }

  const target = event.target as Node | null
  if (!target) {
    highlightPaletteOpen.value = false
    return
  }

  if (!toolbarEl.value?.contains(target)) {
    highlightPaletteOpen.value = false
  }
}

function normalizeRange(editor: Editor, range: { from: number; to: number } | null) {
  if (!range) return null

  const docSize = editor.state.doc.content.size
  const from = Math.max(0, Math.min(range.from, docSize))
  const to = Math.max(0, Math.min(range.to, docSize))

  return from < to ? { from, to } : null
}

function collapseToTextPosition(editor: Editor, position: number, options: { clearStoredMarks?: boolean } = {}) {
  const docSize = editor.state.doc.content.size
  const safePosition = Math.max(0, Math.min(position, docSize))
  const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, safePosition))

  if (options.clearStoredMarks) {
    tr.setStoredMarks([])
  }

  editor.view.dispatch(tr)
  editor.view.focus()
}

watch(() => props.visible, (visible) => {
  if (!visible) {
    highlightPaletteOpen.value = false
    pendingHighlightRange = null
  }
})

onMounted(() => {
  window.addEventListener('pointerdown', closeHighlightPaletteOnOutsideClick)
})

function selectionHasMark(editor: Editor, markName: string) {
  if (editor.isActive(markName)) {
    return true
  }

  const markType = editor.state.schema.marks[markName]
  if (!markType) {
    return false
  }

  const { selection, storedMarks } = editor.state
  const { from, to, empty, $from } = selection

  if (empty) {
    const marksAtCursor = storedMarks ?? $from.marks()
    return marksAtCursor.some((mark) => mark.type === markType)
  }

  let found = false
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (found || !node.isText || !node.marks?.length) {
      return
    }

    found = node.marks.some((mark) => mark.type === markType)
  })

  return found
}

</script>

<style scoped>
.block-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: white;
  border: 1px solid rgb(231 229 228);
  border-radius: 0.5rem;
  padding: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 1000;
}

.bt-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 0.25rem;
  color: rgb(68 64 60);
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: background-color 120ms ease;
}

.bt-btn:hover {
  background: rgb(245 245 244);
  color: rgb(13 148 136);
}

.bt-btn-active {
  background: rgb(204 251 241);
  color: rgb(13 148 136);
}

.bt-separator {
  width: 1px;
  height: 20px;
  background: rgb(214 211 209);
  margin: 0 4px;
}

.bt-highlight-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  min-width: 188px;
  border: 1px solid rgb(231 229 228);
  border-radius: 0.5rem;
  background: white;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 8px;
}

.bt-highlight-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}

.bt-highlight-swatch {
  width: 22px;
  height: 22px;
  border-radius: 0.375rem;
  border: 1px solid rgb(214 211 209);
}

.bt-highlight-actions {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bt-highlight-picker,
.bt-highlight-clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 0.375rem;
  border: 1px solid rgb(231 229 228);
  background: white;
  color: rgb(68 64 60);
  font-size: 0.75rem;
  line-height: 1rem;
}

.bt-highlight-picker {
  position: relative;
  overflow: hidden;
}

.bt-highlight-picker input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.bt-highlight-picker:hover,
.bt-highlight-clear:hover {
  border-color: rgb(45 212 191);
  color: rgb(15 118 110);
}
</style>
