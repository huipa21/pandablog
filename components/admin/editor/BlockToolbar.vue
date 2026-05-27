<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="toolbarEl"
      class="block-toolbar"
      :style="floatingStyles"
      contenteditable="false"
      data-testid="block-popup-toolbar"
      @mousedown.prevent
    >
      <!-- Block-level actions (always visible when toolbar is shown) -->
      <UDropdownMenu :items="transformItems">
        <button type="button" class="bt-btn" title="Transform to...">
          <UIcon :name="currentIcon" class="size-4" />
          <UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" />
        </button>
      </UDropdownMenu>

      <button
        type="button"
        class="bt-btn cursor-grab"
        draggable="true"
        title="Drag to move"
        @dragstart="emit('dragstart', $event)"
        @dragend="emit('dragend')"
      >
        <UIcon name="i-lucide-grip-vertical" class="size-4" />
      </button>

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
import { hasAnyDropdownInlineActive, inlineMenuLabel } from './inlineFormatting'

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
  dragstart: [event: DragEvent]
  dragend: []
  transform: [type: string]
}>()

const toolbarEl = ref<HTMLElement | null>(null)
const refEl = computed(() => props.referenceEl)
const linkDialogOpen = ref(false)
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
    case 'preformatted': return 'i-lucide-text-quote'
    case 'horizontalRule': return 'i-lucide-minus'
    case 'image': return 'i-lucide-image'
    case 'mediaText': return 'i-lucide-panel-left'
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
  { label: 'Preformatted', icon: 'i-lucide-text-quote', onSelect: () => emit('transform', 'preformatted') },
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

const inlineMoreItems = computed(() => [[
  {
    label: inlineMenuLabel('Inline code', inlineActive.value.code),
    icon: 'i-lucide-code',
    class: inlineActive.value.code ? 'bg-teal-50 text-teal-700' : undefined,
    onSelect: () => toggleInlineMark('code')
  },
  {
    label: inlineMenuLabel('Highlight', inlineActive.value.highlight),
    icon: 'i-lucide-highlighter',
    class: inlineActive.value.highlight ? 'bg-teal-50 text-teal-700' : undefined,
    onSelect: () => toggleInlineMark('highlight')
  },
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
]])

const hasDropdownInlineActive = computed(() => hasAnyDropdownInlineActive(inlineActive.value))

function setAlign(value: 'left' | 'center' | 'right' | 'justify') {
  const ed = props.editor
  if (!ed) return
  ;(ed.chain().focus() as any).setTextAlign(value).run()
}

function openLinkDialog() {
  const editor = props.editor
  if (!editor) return

  const restored = restoreLastTextSelection(editor)
  if (!restored && editor.state.selection.empty) {
    return
  }

  const { from, to, empty } = editor.state.selection
  const previousHref = editor.getAttributes('link').href as string | undefined
  const previousTarget = editor.getAttributes('link').target as string | null | undefined
  const previousOpenMode = editor.getAttributes('link').openMode as string | undefined
  const selectedText = empty ? '' : editor.state.doc.textBetween(from, to, ' ', ' ').trim()

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
    return
  }

  const restored = restoreLastTextSelection(editor)
  if (!restored && editor.state.selection.empty) {
    linkDialogOpen.value = false
    return
  }

  const { from, to, empty } = editor.state.selection
  const selectedText = empty ? '' : editor.state.doc.textBetween(from, to, ' ', ' ')
  const displayText = (linkForm.text || selectedText || href).trim()
  const openMode = linkForm.openMode
  const markAttrs: Record<string, unknown> = {
    href,
    target: openMode === 'same-tab' ? null : '_blank',
    rel: openMode === 'same-tab' ? 'noopener noreferrer nofollow' : 'noopener noreferrer',
    openMode
  }

  if (empty) {
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'text',
        text: displayText,
        marks: [{ type: 'link', attrs: markAttrs }]
      })
      .run()

    const cursor = from + displayText.length
    editor.chain().focus().setTextSelection(cursor).unsetAllMarks().run()
    linkDialogOpen.value = false
    return
  }

  editor
    .chain()
    .focus()
    .insertContentAt({ from, to }, {
      type: 'text',
      text: displayText,
      marks: [{ type: 'link', attrs: markAttrs }]
    })
    .run()

  const cursor = from + displayText.length
  editor.chain().focus().setTextSelection(cursor).unsetAllMarks().run()
  linkDialogOpen.value = false
}

function toggleInlineMark(mark: 'bold' | 'italic' | 'strike' | 'code' | 'highlight' | 'subscript' | 'superscript') {
  const ed = props.editor
  if (!ed) return

  const restored = restoreLastTextSelection(ed)
  if (!restored && ed.state.selection.empty) {
    return
  }

  const selectionEnd = ed.state.selection.to
  const hadRangeSelection = !ed.state.selection.empty
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
      chain.toggleHighlight().run()
      break
    case 'subscript':
      chain.toggleSubscript().run()
      break
    case 'superscript':
      chain.toggleSuperscript().run()
      break
  }

  // After applying to a selected range, collapse to end and clear stored marks
  // so newly typed text does not unintentionally continue the styling.
  if (hadRangeSelection) {
    ed.chain().focus().setTextSelection(selectionEnd).unsetAllMarks().run()
  }
}

function restoreLastTextSelection(editor: Editor) {
  if (!editor.state.selection.empty) {
    return true
  }

  const saved = props.lastTextSelection
  if (!saved) {
    return false
  }

  const max = editor.state.doc.content.size
  const from = Math.max(0, Math.min(saved.from, max))
  const to = Math.max(0, Math.min(saved.to, max))
  if (from === to) {
    return false
  }

  editor.chain().focus().setTextSelection({ from: Math.min(from, to), to: Math.max(from, to) }).run()
  return true
}

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
</style>
