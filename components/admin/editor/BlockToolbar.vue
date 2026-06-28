<template>
  <Teleport to="body">
    <div
      v-if="toolbarVisible"
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
        :title="t('admin.editor.toolbar.dragToolbar')"
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
      <UDropdownMenu :items="transformItems" :open="openDropdownMenu === 'transform'" @update:open="setDropdownOpen('transform', $event)">
        <button type="button" class="bt-btn" :title="t('admin.editor.toolbar.transformTo')">
          <UIcon :name="currentIcon" class="size-4" />
          <UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" />
        </button>
      </UDropdownMenu>

      <button type="button" class="bt-btn" :title="t('admin.editor.toolbar.moveUp')" @click="emit('move-up')">
        <UIcon name="i-lucide-arrow-up" class="size-4" />
      </button>
      <button type="button" class="bt-btn" :title="t('admin.editor.toolbar.moveDown')" @click="emit('move-down')">
        <UIcon name="i-lucide-arrow-down" class="size-4" />
      </button>

      <UDropdownMenu :items="alignItems" :open="openDropdownMenu === 'align'" @update:open="setDropdownOpen('align', $event)">
        <button type="button" class="bt-btn" :title="t('admin.editor.toolbar.align')">
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
        :title="t('admin.editor.toolbar.bold')"
        @mousedown.prevent="toggleInlineMark('bold')"
      >
        <UIcon name="i-lucide-bold" class="size-4" />
      </button>
      <button
        type="button"
        class="bt-btn"
        :class="{ 'bt-btn-active': inlineActive.italic }"
        :aria-pressed="inlineActive.italic"
        :title="t('admin.editor.toolbar.italic')"
        @mousedown.prevent="toggleInlineMark('italic')"
      >
        <UIcon name="i-lucide-italic" class="size-4" />
      </button>
      <button
        type="button"
        class="bt-btn"
        :class="{ 'bt-btn-active': inlineActive.strike }"
        :aria-pressed="inlineActive.strike"
        :title="t('admin.editor.toolbar.strikethrough')"
        @mousedown.prevent="toggleInlineMark('strike')"
      >
        <UIcon name="i-lucide-strikethrough" class="size-4" />
      </button>
      <button
        type="button"
        class="bt-btn"
        :class="{ 'bt-btn-active': inlineActive.link }"
        :aria-pressed="inlineActive.link"
        :title="t('admin.editor.toolbar.link')"
        @mousedown.prevent="openLinkDialog"
      >
        <UIcon name="i-lucide-link" class="size-4" />
      </button>
      <button
        type="button"
        class="bt-btn"
        :class="{ 'bt-btn-active': inlineActive.inlineMath }"
        :aria-pressed="inlineActive.inlineMath"
        :title="t('admin.editor.toolbar.inlineFormula')"
        @mousedown.prevent="openInlineMathDialog"
      >
        <UIcon name="i-lucide-sigma" class="size-4" />
      </button>

      <div class="relative">
        <button
          type="button"
          class="bt-btn"
          :class="{ 'bt-btn-active': inlineActive.highlight }"
          :aria-pressed="inlineActive.highlight"
          :title="t('admin.editor.toolbar.highlight')"
          @mousedown.prevent="toggleHighlightPalette"
        >
          <UIcon name="i-lucide-highlighter" class="size-4" />
        </button>

        <div
          v-if="highlightPaletteOpen"
          class="bt-highlight-popover"
          role="dialog"
          :aria-label="t('admin.editor.toolbar.highlightColors')"
          @mousedown.prevent
        >
          <div class="bt-highlight-grid">
            <button
              v-for="color in highlightColors"
              :key="color.value"
              type="button"
              class="bt-highlight-swatch"
              :style="{ backgroundColor: prefersDarkToolbar ? color.dark : color.light }"
              :title="t('admin.editor.toolbar.highlightColor', { label: color.label })"
              :aria-label="t('admin.editor.toolbar.highlightColor', { label: color.label })"
              @mousedown.prevent="setHighlightColor(color.value)"
            />
          </div>

          <div class="bt-highlight-actions">
            <label class="bt-highlight-picker" :title="t('admin.editor.toolbar.customHighlightColor')">
              <UIcon name="i-lucide-palette" class="size-3.5" />
              <span class="sr-only">{{ t('admin.editor.toolbar.custom') }}</span>
              <input type="color" :value="customHighlightColor" @input="setCustomHighlightColor">
            </label>

            <label class="bt-highlight-hex" :title="t('admin.editor.toolbar.highlightHexCode')">
              <span>{{ t('admin.editor.toolbar.hex') }}</span>
              <input
                v-model="customHighlightHex"
                type="text"
                inputmode="text"
                pattern="#[0-9a-fA-F]{6}"
                placeholder="#RRGGBB"
                :aria-label="t('admin.editor.toolbar.highlightHexCode')"
                @keydown.enter.prevent="applyCustomHighlightHex"
                @blur="applyCustomHighlightHex"
              >
            </label>

            <button
              type="button"
              class="bt-highlight-clear"
              :title="t('admin.editor.toolbar.removeHighlight')"
              @mousedown.prevent="unsetHighlightColor"
            >
              <UIcon name="i-lucide-eraser" class="size-3.5" />
              <span>{{ t('admin.editor.toolbar.transparent') }}</span>
            </button>
          </div>
        </div>
      </div>

      <UDropdownMenu :items="inlineMoreItems" :open="openDropdownMenu === 'inlineMore'" @update:open="setDropdownOpen('inlineMore', $event)">
        <button
          type="button"
          class="bt-btn"
          :class="{ 'bt-btn-active': hasDropdownInlineActive }"
          :aria-pressed="hasDropdownInlineActive"
          :title="t('admin.editor.toolbar.moreFormatting')"
        >
          <UIcon name="i-lucide-chevron-down" class="size-4" />
        </button>
      </UDropdownMenu>

      <!-- Annotate (ruby) -->
      <div class="relative">
        <button
          type="button"
          class="bt-btn"
          :class="{ 'bt-btn-active': annotateBusy }"
          :title="t('admin.editor.toolbar.annotate', { lang: annotateLang.toUpperCase() })"
          :disabled="annotateBusy"
          @mousedown.prevent="runAnnotate"
        >
          <UIcon :name="annotateBusy ? 'i-lucide-loader-circle' : 'i-lucide-languages'" class="size-4" :class="{ 'animate-spin': annotateBusy }" />
        </button>
        <button
          type="button"
          class="bt-btn bt-btn-suffix"
          :title="t('admin.editor.toolbar.chooseAnnotationLanguage')"
          :disabled="annotateBusy"
          @mousedown.prevent="toggleAnnotateLangPicker"
        >
          <UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" />
        </button>

        <div
          v-if="annotateLangPickerOpen"
          class="bt-annotate-popover"
          role="dialog"
          :aria-label="t('admin.editor.toolbar.annotationLanguage')"
          @mousedown.prevent
        >
          <button
            v-for="option in annotateLangOptions"
            :key="option.value"
            type="button"
            class="bt-annotate-lang-option"
            :class="{ 'is-active': annotateLang === option.value }"
            @click="selectAnnotateLang(option.value)"
          >
            <span class="bt-annotate-lang-label">{{ option.label }}</span>
            <span class="bt-annotate-lang-hint">{{ option.hint }}</span>
          </button>
        </div>
      </div>

      <!-- 3-dot More menu -->
      <UDropdownMenu :items="moreItems" :open="openDropdownMenu === 'more'" @update:open="setDropdownOpen('more', $event)">
        <button type="button" class="bt-btn" :title="t('admin.editor.toolbar.moreOptions')">
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
            <h3 class="text-base font-semibold text-[var(--pb-text)]">{{ t('admin.editor.toolbar.editLink') }}</h3>
            <p class="text-xs text-[var(--pb-text-subtle)]">{{ t('admin.editor.toolbar.editLinkDescription') }}</p>
          </div>
        </template>

        <div class="grid gap-3">
          <UFormField :label="t('admin.editor.toolbar.url')">
            <UInput v-model="linkForm.href" placeholder="https://example.com" autofocus />
          </UFormField>
          <UFormField :label="t('admin.editor.toolbar.displayText')">
            <UInput v-model="linkForm.text" :placeholder="t('admin.editor.toolbar.linkText')" />
          </UFormField>
          <UFormField :label="t('admin.editor.toolbar.openBehavior')">
            <USelect v-model="linkForm.openMode" :items="linkOpenModeItems" />
          </UFormField>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton type="button" variant="ghost" color="neutral" @click="linkDialogOpen = false">{{ t('admin.editor.toolbar.cancel') }}</UButton>
            <UButton type="button" color="primary" @click="applyLinkDialog">{{ t('admin.editor.toolbar.apply') }}</UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>

  <UModal v-model:open="inlineMathDialogOpen">
    <template #content>
      <UCard>
        <template #header>
          <div>
            <h3 class="text-base font-semibold text-[var(--pb-text)]">{{ t('admin.editor.toolbar.inlineFormula') }}</h3>
            <p class="text-xs text-[var(--pb-text-subtle)]">{{ t('admin.editor.toolbar.inlineFormulaDescription') }}</p>
          </div>
        </template>

        <div class="bt-inline-math-dialog">
          <UFormField :label="t('admin.editor.toolbar.latexSource')">
            <UTextarea
              v-model="inlineMathForm.latex"
              :rows="5"
              :placeholder="t('admin.editor.toolbar.inlineFormulaPlaceholder')"
              autofocus
              class="w-full font-mono text-sm"
            />
          </UFormField>

          <section class="bt-inline-math-preview" :class="{ 'is-empty': !inlineMathForm.latex.trim() }" :aria-label="t('admin.editor.toolbar.formulaPreview')">
            <span v-if="!inlineMathForm.latex.trim()" class="bt-inline-math-preview-empty">
              {{ t('admin.editor.toolbar.formulaPreviewEmpty') }}
            </span>
            <span v-else class="math-render" v-html="inlineMathPreviewHtml" />
          </section>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton type="button" variant="ghost" color="neutral" @click="closeInlineMathDialog">{{ t('admin.editor.toolbar.cancel') }}</UButton>
            <UButton type="button" color="primary" :disabled="!inlineMathForm.latex.trim()" @click="applyInlineMathDialog">{{ t('admin.editor.toolbar.insertFormula') }}</UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue'
import type { Editor } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { Fragment } from '@tiptap/pm/model'
import type { CSSProperties } from 'vue'
import { hasAnyDropdownInlineActive, inlineMenuLabel } from './inlineFormatting'
import { curatedHighlightOptions, DEFAULT_HIGHLIGHT_COLOR, DEFAULT_HIGHLIGHT_PICKER_HEX } from '~/utils/highlightColors'
import { DEFAULT_ANNOT_LANG, isAnnotLang, type AnnotLang } from '~/extensions/rubyUnit'
import { useReadings } from '~/composables/editor/useReadings'
import { renderLatex } from '~/utils/renderLatex'

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

const { t } = useI18n()
const toolbarEl = ref<HTMLElement | null>(null)
const refEl = computed(() => props.referenceEl)
const popupWindowOpen = ref(false)
const toolbarVisible = computed(() => props.visible && !popupWindowOpen.value)
const linkDialogOpen = ref(false)
const linkDialogRange = ref<{ from: number; to: number } | null>(null)
const inlineMathDialogOpen = ref(false)
const inlineMathDialogRange = ref<{ from: number; to: number } | null>(null)
const highlightPaletteOpen = ref(false)
const customHighlightColor = ref(DEFAULT_HIGHLIGHT_PICKER_HEX)
const customHighlightHex = ref(DEFAULT_HIGHLIGHT_PICKER_HEX)
const prefersDarkToolbar = ref(false)
const highlightColors = curatedHighlightOptions()
type ToolbarDropdownMenu = 'transform' | 'align' | 'inlineMore' | 'more'
const openDropdownMenu = ref<ToolbarDropdownMenu | null>(null)
let pendingHighlightRange: { from: number; to: number } | null = null
let themeObserver: MutationObserver | null = null
let popupObserver: MutationObserver | null = null

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
  window.removeEventListener('pointerdown', closeAnnotatePopoverOnOutsideClick)
  themeObserver?.disconnect()
  popupObserver?.disconnect()
})
const linkForm = reactive({
  href: 'https://',
  text: '',
  openMode: 'same-tab' as 'same-tab' | 'new-tab' | 'new-window'
})
const inlineMathForm = reactive({
  latex: ''
})
const inlineMathPreviewHtml = computed(() => inlineMathForm.latex.trim()
  ? renderLatex(inlineMathForm.latex, { displayMode: false })
  : '')

const linkOpenModeItems = computed(() => [
  { label: t('admin.editor.toolbar.openSameTab'), value: 'same-tab' },
  { label: t('admin.editor.toolbar.openNewTab'), value: 'new-tab' },
  { label: t('admin.editor.toolbar.openNewWindow'), value: 'new-window' }
])

// Annotate (ruby) state
const ANNOTATE_LANG_STORAGE_KEY = 'pandablog:annotate-lang'
const annotateLang = ref<AnnotLang>(loadAnnotateLang())
const annotateLangPickerOpen = ref(false)
const annotateBusy = ref(false)
const annotateLangOptions = computed<Array<{ value: AnnotLang, label: string, hint: string }>>(() => [
  { value: 'cmn', label: t('admin.editor.toolbar.mandarin'), hint: t('admin.editor.toolbar.pinyinToneMarks') },
  { value: 'yue', label: t('admin.editor.toolbar.cantonese'), hint: t('admin.editor.toolbar.jyutping') },
  { value: 'jpn', label: t('admin.editor.toolbar.japanese'), hint: t('admin.editor.toolbar.furiganaHiragana') }
])
const { annotate } = useReadings()

function closeCustomPopovers() {
  highlightPaletteOpen.value = false
  annotateLangPickerOpen.value = false
}

function closeDropdownMenus() {
  openDropdownMenu.value = null
}

function setDropdownOpen(menu: ToolbarDropdownMenu, open: boolean) {
  if (open) {
    closeCustomPopovers()
    openDropdownMenu.value = menu
    return
  }

  if (openDropdownMenu.value === menu) {
    openDropdownMenu.value = null
  }
}

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
    case 'filesBlock': return 'i-lucide-files'
    case 'columnsBlock': return 'i-lucide-columns-3'
    case 'tabsBlock': return 'i-lucide-panel-top'
    case 'accordionBlock': return 'i-lucide-chevrons-up-down'
    case 'customHtml': return 'i-lucide-file-code-2'
    case 'mermaid': return 'i-lucide-git-fork'
    default: return 'i-lucide-box'
  }
})

const transformItems = computed(() => [[
  { label: t('admin.editor.toolbar.paragraph'), icon: 'i-lucide-pilcrow', onSelect: () => emit('transform', 'paragraph') },
  { label: t('admin.editor.toolbar.heading1'), icon: 'i-lucide-heading-1', onSelect: () => emit('transform', 'heading-1') },
  { label: t('admin.editor.toolbar.heading2'), icon: 'i-lucide-heading-2', onSelect: () => emit('transform', 'heading-2') },
  { label: t('admin.editor.toolbar.heading3'), icon: 'i-lucide-heading-3', onSelect: () => emit('transform', 'heading-3') },
  { label: t('admin.editor.toolbar.bulletList'), icon: 'i-lucide-list', onSelect: () => emit('transform', 'bulletList') },
  { label: t('admin.editor.toolbar.numberedList'), icon: 'i-lucide-list-ordered', onSelect: () => emit('transform', 'orderedList') },
  { label: t('admin.editor.toolbar.quote'), icon: 'i-lucide-quote', onSelect: () => emit('transform', 'blockquote') },
  { label: t('admin.editor.toolbar.code'), icon: 'i-lucide-square-code', onSelect: () => emit('transform', 'codeBlock') },
  { label: t('admin.editor.toolbar.separator'), icon: 'i-lucide-minus', onSelect: () => emit('transform', 'horizontalRule') }
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
  { label: t('admin.editor.toolbar.alignLeft'), icon: 'i-lucide-align-left', onSelect: () => setAlign('left') },
  { label: t('admin.editor.toolbar.alignCenter'), icon: 'i-lucide-align-center', onSelect: () => setAlign('center') },
  { label: t('admin.editor.toolbar.alignRight'), icon: 'i-lucide-align-right', onSelect: () => setAlign('right') },
  { label: t('admin.editor.toolbar.justify'), icon: 'i-lucide-align-justify', onSelect: () => setAlign('justify') }
]])

const moreItems = computed(() => [[
  { label: t('admin.editor.toolbar.copy'), icon: 'i-lucide-clipboard-copy', onSelect: () => emit('copy-block') },
  { label: t('admin.editor.toolbar.cut'), icon: 'i-lucide-scissors', onSelect: () => emit('cut-block') },
  { label: t('admin.editor.toolbar.duplicate'), icon: 'i-lucide-copy', onSelect: () => emit('duplicate') }
], [
  { label: t('admin.editor.toolbar.addBefore'), icon: 'i-lucide-arrow-up-to-line', onSelect: () => emit('add-before') },
  { label: t('admin.editor.toolbar.addAfter'), icon: 'i-lucide-arrow-down-to-line', onSelect: () => emit('add-after') }
], [
  { label: t('admin.editor.toolbar.editAsHtml'), icon: 'i-lucide-file-code-2', onSelect: () => emit('edit-html') }
], [
  { label: t('admin.editor.toolbar.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete') }
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
      inlineMath: false,
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
    inlineMath: selectionHasInlineNode(ed, 'inlineMath'),
    subscript: selectionHasMark(ed, 'subscript'),
    superscript: selectionHasMark(ed, 'superscript')
  }
})

const inlineMoreItems = computed(() => [
  [
    {
      label: inlineMenuLabel(t('admin.editor.toolbar.inlineCode'), inlineActive.value.code),
      icon: 'i-lucide-code',
      class: inlineActive.value.code ? 'bg-teal-50 text-teal-700' : undefined,
      onSelect: () => toggleInlineMark('code')
    }
  ],
  [
    {
      label: inlineMenuLabel(t('admin.editor.toolbar.subscript'), inlineActive.value.subscript),
      icon: 'i-lucide-subscript',
      class: inlineActive.value.subscript ? 'bg-teal-50 text-teal-700' : undefined,
      onSelect: () => toggleInlineMark('subscript')
    },
    {
      label: inlineMenuLabel(t('admin.editor.toolbar.superscript'), inlineActive.value.superscript),
      icon: 'i-lucide-superscript',
      class: inlineActive.value.superscript ? 'bg-teal-50 text-teal-700' : undefined,
      onSelect: () => toggleInlineMark('superscript')
    },
    { label: t('admin.editor.toolbar.footnote'), icon: 'i-lucide-footprints', onSelect: () => emit('add-footnote') }
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
    if (selectionHasMark(editor, 'link')) {
      editor.chain().focus().extendMarkRange('link').run()
    }
  }

  const { from, to, empty } = editor.state.selection

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

function openInlineMathDialog() {
  const editor = props.editor
  if (!editor) return

  const inlineNode = currentInlineMathNode(editor)
  if (inlineNode) {
    inlineMathDialogRange.value = inlineNode.range
    inlineMathForm.latex = inlineNode.latex
    inlineMathDialogOpen.value = true
    return
  }

  const range = currentInlineTextRange(editor)
  inlineMathDialogRange.value = range
  inlineMathForm.latex = range ? editor.state.doc.textBetween(range.from, range.to, ' ', ' ') : ''
  inlineMathDialogOpen.value = true
}

function closeInlineMathDialog() {
  inlineMathDialogOpen.value = false
  inlineMathDialogRange.value = null
  inlineMathForm.latex = ''
}

function applyInlineMathDialog() {
  const editor = props.editor
  const latex = inlineMathForm.latex.trim()
  if (!editor || !latex) return

  const range = normalizeRange(editor, inlineMathDialogRange.value)
  const insertPos = range?.from ?? editor.state.selection.from
  if (range) {
    editor.chain().focus().insertContentAt(range, { type: 'inlineMath', attrs: { latex } }).run()
  } else {
    editor.chain().focus().setInlineMath({ latex }).run()
  }

  collapseToTextPosition(editor, insertPos + 1, { clearStoredMarks: true })
  closeInlineMathDialog()
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

  const range = linkDialogRange.value ?? { from: editor.state.selection.from, to: editor.state.selection.to }
  if (!range) {
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
  if (isHexColor(color)) {
    customHighlightColor.value = color
    customHighlightHex.value = color
  }

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
  closeDropdownMenus()
  annotateLangPickerOpen.value = false

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

  customHighlightColor.value = DEFAULT_HIGHLIGHT_PICKER_HEX
  highlightPaletteOpen.value = true
}

function setCustomHighlightColor(event: Event) {
  const value = (event.target as HTMLInputElement).value
  customHighlightColor.value = value
  customHighlightHex.value = value
  setHighlightColor(value)
}

function applyCustomHighlightHex() {
  const value = customHighlightHex.value.trim()
  if (!isHexColor(value)) {
    customHighlightHex.value = customHighlightColor.value.startsWith('#') ? customHighlightColor.value : DEFAULT_HIGHLIGHT_PICKER_HEX
    return
  }

  customHighlightColor.value = value
  setHighlightColor(value)
}

function isHexColor(value: string) {
  return /^#(?:[\da-fA-F]{3}|[\da-fA-F]{6})$/.test(value.trim())
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

function closeAnnotatePopoverOnOutsideClick(event: PointerEvent) {
  if (!annotateLangPickerOpen.value) {
    return
  }

  const target = event.target as Node | null
  if (!target) {
    annotateLangPickerOpen.value = false
    return
  }

  if (!toolbarEl.value?.contains(target)) {
    annotateLangPickerOpen.value = false
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
    annotateLangPickerOpen.value = false
  }
})

onMounted(() => {
  window.addEventListener('pointerdown', closeHighlightPaletteOnOutsideClick)
  window.addEventListener('pointerdown', closeAnnotatePopoverOnOutsideClick)
  prefersDarkToolbar.value = document.documentElement.dataset.theme === 'dark'
  themeObserver = new MutationObserver(() => {
    prefersDarkToolbar.value = document.documentElement.dataset.theme === 'dark'
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  updatePopupWindowOpen()
  popupObserver = new MutationObserver(() => updatePopupWindowOpen())
  popupObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'role', 'data-state'] })
})

function updatePopupWindowOpen() {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
  popupWindowOpen.value = dialogs.some((dialog) => {
    if (toolbarEl.value?.contains(dialog)) {
      return false
    }

    return dialog.getClientRects().length > 0 && getComputedStyle(dialog).visibility !== 'hidden'
  })
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

function selectionHasInlineNode(editor: Editor, nodeName: string) {
  if (editor.isActive(nodeName)) {
    return true
  }

  const nodeType = editor.state.schema.nodes[nodeName]
  if (!nodeType) {
    return false
  }

  const { from, to, empty, $from } = editor.state.selection
  if (empty) {
    return $from.nodeAfter?.type === nodeType || $from.nodeBefore?.type === nodeType
  }

  let found = false
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (found) return false
    if (node.type === nodeType) {
      found = true
      return false
    }
  })

  return found
}

function currentInlineMathNode(editor: Editor) {
  const nodeType = editor.state.schema.nodes.inlineMath
  if (!nodeType) {
    return null
  }

  const { selection } = editor.state
  if (selection instanceof NodeSelection && selection.node.type === nodeType) {
    return {
      latex: String(selection.node.attrs.latex ?? ''),
      range: { from: selection.from, to: selection.to }
    }
  }

  return null
}

function currentInlineTextRange(editor: Editor): { from: number, to: number } | null {
  const { selection } = editor.state
  if (selection instanceof TextSelection && !selection.empty) {
    return { from: selection.from, to: selection.to }
  }
  return null
}

function loadAnnotateLang(): AnnotLang {
  if (typeof window === 'undefined') return DEFAULT_ANNOT_LANG
  try {
    const stored = window.localStorage.getItem(ANNOTATE_LANG_STORAGE_KEY)
    return isAnnotLang(stored) ? stored : DEFAULT_ANNOT_LANG
  } catch {
    return DEFAULT_ANNOT_LANG
  }
}

function persistAnnotateLang(value: AnnotLang) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ANNOTATE_LANG_STORAGE_KEY, value)
  } catch {
    /* ignore quota errors */
  }
}

function selectAnnotateLang(value: AnnotLang) {
  annotateLang.value = value
  persistAnnotateLang(value)
  annotateLangPickerOpen.value = false
}

function toggleAnnotateLangPicker() {
  closeDropdownMenus()
  highlightPaletteOpen.value = false
  annotateLangPickerOpen.value = !annotateLangPickerOpen.value
}

function resolveAnnotateLang(): AnnotLang {
  const ed = props.editor
  if (!ed) return annotateLang.value

  // If the selection lives inside an annotationBlock, prefer the block's lang.
  const { $from } = ed.state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === 'annotationBlock') {
      const blockLang = node.attrs?.lang
      if (isAnnotLang(blockLang)) return blockLang
    }
  }

  return annotateLang.value
}

async function runAnnotate() {
  if (annotateBusy.value) return
  const ed = props.editor
  if (!ed) return

  const range = currentTextRange(ed)
  if (!range) return

  const text = ed.state.doc.textBetween(range.from, range.to, '\u2028', '\u2028')
  if (!text || !text.trim()) return

  const lang = resolveAnnotateLang()

  annotateBusy.value = true
  try {
    const segments = await annotate(text, lang)
    if (segments.length === 0) return

    const schema = ed.state.schema
    const rubyType = schema.nodes.rubyUnit
    if (!rubyType) return

    const fragmentNodes = segments.flatMap((segment) => {
      if (segment.kind === 'ruby') {
        return [rubyType.create({ base: segment.base, reading: segment.reading, lang })]
      }
      if (segment.text) {
        return [schema.text(segment.text)]
      }
      return []
    })

    if (fragmentNodes.length === 0) return

    const tr = ed.state.tr
    tr.replaceWith(range.from, range.to, Fragment.fromArray(fragmentNodes))
    tr.setMeta('addToHistory', true)
    ed.view.dispatch(tr)
    ed.commands.focus()
  } catch (error) {
    console.error('[annotate] failed', error)
  } finally {
    annotateBusy.value = false
  }
}

function currentTextRange(editor: Editor): { from: number, to: number } | null {
  const { selection } = editor.state
  if (!selection.empty) {
    return { from: selection.from, to: selection.to }
  }
  if (props.lastTextSelection && props.lastTextSelection.from !== props.lastTextSelection.to) {
    return { from: props.lastTextSelection.from, to: props.lastTextSelection.to }
  }
  return null
}

</script>

<style scoped>
.block-toolbar {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 2px;
  color: var(--pb-text);
  background: color-mix(in srgb, var(--pb-card-bg) 96%, var(--pb-text) 4%);
  border: 1px solid var(--pb-divider-strong);
  border-radius: var(--pb-radius-card-inner);
  padding: 4px;
  box-shadow: var(--pb-shadow-lg), 0 0 0 1px color-mix(in srgb, var(--pb-text) 8%, transparent);
  z-index: var(--block-menu-z, 40);
}

@media (max-width: 767px) {
  .block-toolbar {
    position: fixed !important;
    right: 0.5rem !important;
    bottom: calc(env(safe-area-inset-bottom, 0px) + var(--pb-editor-keyboard-inset, 0px) + 0.5rem) !important;
    left: 0.5rem !important;
    top: auto !important;
    justify-content: center;
    align-content: center;
    flex-wrap: wrap;
    max-width: calc(100vw - 1rem);
    max-height: min(34vh, 11rem);
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    border-radius: var(--pb-radius-card-outer);
    padding: 0.375rem;
  }

  .block-toolbar .bt-btn:first-child,
  .block-toolbar .bt-separator {
    display: none;
  }

  .bt-btn {
    min-width: 2.25rem;
    min-height: 2.25rem;
    justify-content: center;
    padding: 0.375rem;
  }

  .bt-highlight-popover {
    position: fixed;
    right: 0.75rem;
    bottom: calc(env(safe-area-inset-bottom, 0px) + var(--pb-editor-keyboard-inset, 0px) + 3.75rem);
    left: auto;
    top: auto;
    max-width: calc(100vw - 1.5rem);
  }

  .bt-annotate-popover {
    position: fixed;
    right: 0.75rem;
    bottom: calc(env(safe-area-inset-bottom, 0px) + var(--pb-editor-keyboard-inset, 0px) + 3.75rem);
    left: auto;
    top: auto;
    max-width: calc(100vw - 1.5rem);
  }
}

:global([data-theme="dark"]) .block-toolbar {
  background: color-mix(in srgb, var(--pb-card-bg) 84%, var(--pb-text) 16%);
  border-color: color-mix(in srgb, var(--pb-text) 42%, var(--pb-divider-strong));
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.38), 0 0 0 1px color-mix(in srgb, var(--pb-text) 16%, transparent);
}

.bt-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 0.25rem;
  color: var(--pb-text-subtle);
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

.bt-btn :deep(svg),
.bt-btn :deep([class^="i-lucide-"]),
.bt-btn :deep([class*=" i-lucide-"]) {
  color: currentcolor;
}

.bt-btn:hover {
  background: var(--pb-card-bg-hover);
  color: var(--pb-text);
}

.bt-btn-active {
  background: var(--pb-selected-bg);
  color: var(--pb-link-hover);
  box-shadow: inset 0 0 0 1px var(--pb-selected-border);
}

.bt-btn-active:hover {
  background: color-mix(in srgb, var(--pb-selected-bg) 76%, var(--pb-primary) 24%);
  color: var(--pb-text);
}

:global([data-theme="dark"]) .bt-btn-active {
  background: color-mix(in srgb, var(--pb-primary) 34%, var(--pb-card-bg));
  color: var(--pb-primary-contrast);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pb-primary) 72%, var(--pb-text));
}

:global([data-theme="dark"]) .bt-btn-active:hover {
  background: color-mix(in srgb, var(--pb-primary) 48%, var(--pb-card-bg));
  color: var(--pb-primary-contrast);
}

.bt-separator {
  width: 1px;
  height: 20px;
  background: var(--pb-divider-strong);
  margin: 0 4px;
}

.bt-highlight-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  min-width: 248px;
  border: 1px solid var(--pb-divider-strong);
  border-radius: var(--pb-radius-card-inner);
  background: var(--pb-card-bg);
  box-shadow: var(--pb-shadow-lg);
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
  border: 1px solid var(--pb-border-strong);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pb-text) 12%, transparent);
}

.bt-highlight-actions {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.bt-highlight-picker,
.bt-highlight-clear,
.bt-highlight-hex {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 0.375rem;
  border: 1px solid var(--pb-card-border);
  background: var(--pb-card-bg);
  color: var(--pb-text-muted);
  font-size: 0.75rem;
  line-height: 1rem;
}

.bt-highlight-picker {
  position: relative;
  overflow: hidden;
  width: 1.875rem;
  justify-content: center;
}

.bt-highlight-picker input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.bt-highlight-hex {
  flex: 1 1 7.5rem;
  min-width: 7.5rem;
}

.bt-highlight-hex span {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--pb-text-subtle);
}

.bt-highlight-hex input {
  min-width: 0;
  width: 5.75rem;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--pb-text);
  font-family: var(--font-mono, 'Courier New', Courier, monospace);
  font-size: 0.75rem;
  text-transform: uppercase;
}

.bt-highlight-hex:focus-within {
  border-color: var(--pb-selected-border);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--pb-primary) 18%, transparent);
}

.bt-highlight-picker:hover,
.bt-highlight-hex:hover,
.bt-highlight-clear:hover {
  border-color: var(--pb-selected-border);
  color: var(--pb-link-hover);
}

.bt-inline-math-dialog {
  display: grid;
  gap: 0.875rem;
}

.bt-inline-math-preview {
  min-height: 4.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.875rem;
  border: 1px solid var(--pb-divider);
  border-radius: var(--pb-radius-md);
  background: var(--pb-surface-subtle);
  color: var(--pb-text);
  overflow-x: auto;
}

.bt-inline-math-preview.is-empty {
  border-style: dashed;
  color: var(--pb-text-placeholder);
}

.bt-inline-math-preview .math-render {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  overflow-x: auto;
}

.bt-inline-math-preview :deep(.katex) {
  font-size: 1.08em;
}

.bt-inline-math-preview-empty {
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.bt-btn-suffix {
  padding-left: 2px;
  padding-right: 2px;
  margin-left: -3px;
}

.bt-annotate-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 180px;
  padding: 4px;
  border: 1px solid var(--pb-divider-strong);
  border-radius: var(--pb-radius-card-inner);
  background: var(--pb-card-bg);
  box-shadow: var(--pb-shadow-lg);
}

.bt-annotate-lang-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 6px 8px;
  border-radius: 0.375rem;
  text-align: left;
  color: var(--pb-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
}

.bt-annotate-lang-option:hover {
  background: var(--pb-card-bg-hover);
}

.bt-annotate-lang-option.is-active {
  background: var(--pb-selected-bg);
  color: var(--pb-link-hover);
}

.bt-annotate-lang-label {
  font-size: 0.8rem;
  font-weight: 600;
}

.bt-annotate-lang-hint {
  font-size: 0.7rem;
  color: var(--pb-text-subtle);
}
</style>
