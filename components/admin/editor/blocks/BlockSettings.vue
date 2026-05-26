<template>
  <div class="space-y-4">
    <div v-if="!blockName" class="rounded-md border border-dashed border-stone-200 p-4 text-sm text-stone-500">
      Select a block to edit its settings.
    </div>

    <template v-else>
      <div class="rounded-md border border-stone-200 bg-white p-3">
        <div class="flex items-center gap-2">
          <UIcon :name="blockDefinition?.icon ?? 'i-lucide-box'" class="size-4 text-teal-700" />
          <div>
            <div class="text-sm font-semibold text-stone-900">{{ blockDefinition?.title ?? blockName }}</div>
            <div class="text-xs text-stone-500">{{ blockDefinition?.description ?? 'Block settings' }}</div>
          </div>
        </div>
      </div>

      <details v-if="blockName === 'heading'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Heading</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Heading level">
            <USelect :model-value="String(attrs.level ?? 2)" :items="headingLevelItems" @update:model-value="setHeadingLevel" />
          </UFormField>
        </div>
      </details>

      <details v-if="blockName === 'image'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Image</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Source URL">
            <UInput :model-value="String(attrs.src ?? '')" @update:model-value="updateAttrs({ src: String($event) })" />
          </UFormField>
          <UFormField label="Alt text">
            <UInput :model-value="String(attrs.alt ?? '')" @update:model-value="updateAttrs({ alt: String($event) })" />
          </UFormField>
          <UFormField label="Title">
            <UInput :model-value="String(attrs.title ?? '')" @update:model-value="updateAttrs({ title: String($event) })" />
          </UFormField>
          <UFormField label="Title position">
            <USelect
              :model-value="String(attrs.titlePosition ?? 'bottom')"
              :items="[{label: 'None', value: 'none'}, {label: 'Top', value: 'top'}, {label: 'Bottom', value: 'bottom'}]"
              @update:model-value="updateAttrs({ titlePosition: String($event) })"
            />
          </UFormField>
          <UFormField label="Source size">
            <USelect
              :model-value="imageSourceSize"
              :items="sourceSizeItems"
              @update:model-value="setImageSourceSize"
            />
          </UFormField>
          <UFormField label="Display size">
            <USelect
              :model-value="imageDisplaySize"
              :items="displaySizeItems"
              @update:model-value="setImageDisplaySize"
            />
          </UFormField>
          <div v-if="imageDisplaySize === 'custom-px'" class="grid grid-cols-2 gap-2">
            <UFormField label="Display width (px)">
              <UInput type="number" :model-value="(attrs.displayPx as number | null) ?? (attrs.width as number | null) ?? undefined" @update:model-value="setImageWidth" />
            </UFormField>
            <UFormField label="Display height (px)">
              <UInput type="number" :model-value="(attrs.height as number | null) ?? undefined" @update:model-value="setImageHeight" />
            </UFormField>
          </div>
          <UFormField v-if="imageDisplaySize === 'custom-percent'" label="Display size (%)">
            <div class="space-y-2">
              <input
                type="range"
                min="1"
                max="200"
                :value="Number(attrs.displayPercent ?? attrs.widthPercent ?? 100)"
                class="w-full"
                @input="setImageDisplayPercent(($event.target as HTMLInputElement).value)"
              >
              <UInput
                type="number"
                min="1"
                max="200"
                :model-value="(attrs.displayPercent as number | null) ?? (attrs.widthPercent as number | null) ?? 100"
                @update:model-value="setImageDisplayPercent"
              />
            </div>
          </UFormField>
          <UFormField>
            <UCheckbox
              :model-value="attrs.lockAspect !== false"
              label="Maintain aspect ratio"
              @update:model-value="setImageLockAspect"
            />
          </UFormField>
          <UFormField label="Alignment">
            <USelect
              :model-value="String(attrs.align ?? 'center')"
              :items="[{label: 'Left', value: 'left'}, {label: 'Center', value: 'center'}, {label: 'Right', value: 'right'}]"
              @update:model-value="updateAttrs({ align: String($event) })"
            />
          </UFormField>
        </div>
      </details>

      <details v-if="blockName === 'mediaText'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Media &amp; Text</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Media position">
            <USelect
              :model-value="String(attrs.mediaPosition ?? 'left')"
              :items="[{label: 'Left', value: 'left'}, {label: 'Right', value: 'right'}]"
              @update:model-value="updateAttrs({ mediaPosition: String($event) })"
            />
          </UFormField>
          <UFormField label="Media URL">
            <UInput :model-value="String(attrs.mediaSrc ?? '')" @update:model-value="updateAttrs({ mediaSrc: String($event) })" />
          </UFormField>
          <UFormField label="Alt">
            <UInput :model-value="String(attrs.mediaAlt ?? '')" @update:model-value="updateAttrs({ mediaAlt: String($event) })" />
          </UFormField>
          <UFormField label="Caption">
            <UInput :model-value="String(attrs.mediaTitle ?? '')" @update:model-value="updateAttrs({ mediaTitle: String($event) })" />
          </UFormField>
          <UFormField label="Caption position">
            <USelect
              :model-value="String(attrs.mediaTitlePosition ?? 'bottom')"
              :items="[{label: 'None', value: 'none'}, {label: 'Top', value: 'top'}, {label: 'Bottom', value: 'bottom'}]"
              @update:model-value="updateAttrs({ mediaTitlePosition: String($event) })"
            />
          </UFormField>
          <UFormField label="Whole block width">
            <USelect
              :model-value="String(attrs.blockWidth ?? 'content')"
              :items="blockWidthItems"
              @update:model-value="updateAttrs({ blockWidth: String($event) })"
            />
          </UFormField>
          <UFormField label="Media source size">
            <USelect
              :model-value="mediaSourceSize"
              :items="sourceSizeItems"
              @update:model-value="setMediaSourceSize"
            />
          </UFormField>
          <UFormField label="Media display size">
            <USelect
              :model-value="mediaDisplaySize"
              :items="displaySizeItems"
              @update:model-value="setMediaDisplaySize"
            />
          </UFormField>
          <div v-if="mediaDisplaySize === 'custom-px'" class="grid grid-cols-2 gap-2">
            <UFormField label="Media width (px)">
              <UInput type="number" :model-value="(attrs.mediaDisplayPx as number | null) ?? (attrs.mediaWidth as number | null) ?? undefined" @update:model-value="setMediaWidth" />
            </UFormField>
            <UFormField label="Media height (px)">
              <UInput type="number" :model-value="(attrs.mediaHeight as number | null) ?? undefined" @update:model-value="setMediaHeight" />
            </UFormField>
          </div>
          <UFormField v-if="mediaDisplaySize === 'custom-percent'" label="Media size (%)">
            <div class="space-y-2">
              <input
                type="range"
                min="1"
                max="200"
                :value="Number(attrs.mediaDisplayPercent ?? attrs.mediaWidthPercent ?? 100)"
                class="w-full"
                @input="setMediaDisplayPercent(($event.target as HTMLInputElement).value)"
              >
              <UInput
                type="number"
                min="1"
                max="200"
                :model-value="(attrs.mediaDisplayPercent as number | null) ?? (attrs.mediaWidthPercent as number | null) ?? 100"
                @update:model-value="setMediaDisplayPercent"
              />
            </div>
          </UFormField>
          <UFormField>
            <UCheckbox
              :model-value="attrs.lockAspect !== false"
              label="Maintain aspect ratio"
              @update:model-value="setMediaLockAspect"
            />
          </UFormField>
          <UFormField label="Media / Text ratio">
            <USelect
              :model-value="String(Math.round(Number(attrs.ratio ?? 0.5) * 100))"
              :items="ratioPresetItems"
              @update:model-value="setMediaRatioPreset"
            />
          </UFormField>
          <UFormField :label="`Column split (${Math.round(Number(attrs.ratio ?? 0.5) * 100)}% / ${100 - Math.round(Number(attrs.ratio ?? 0.5) * 100)}%)`">
            <input
              type="range"
              min="15"
              max="85"
              :value="Math.round(Number(attrs.ratio ?? 0.5) * 100)"
              class="w-full"
              @input="updateAttrs({ ratio: Number(($event.target as HTMLInputElement).value) / 100 })"
            >
          </UFormField>
        </div>
      </details>

      <details v-if="blockName === 'codeBlock'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Code</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="File name (optional)">
            <UInput :model-value="String(attrs.fileName ?? '')" placeholder="app.ts" @update:model-value="setCodeFileName" />
          </UFormField>
          <UFormField label="Language">
            <USelect :model-value="String(attrs.language ?? 'text')" :items="languageItems" @update:model-value="setCodeLanguage" />
          </UFormField>
          <UFormField label="Theme">
            <USelect :model-value="String(attrs.theme ?? 'github-dark')" :items="themeItems" @update:model-value="setCodeTheme" />
          </UFormField>
          <UFormField>
            <UCheckbox
              :model-value="attrs.lineNumbers !== false"
              label="Show line numbers"
              @update:model-value="setCodeLineNumbers"
            />
          </UFormField>
          <UFormField>
            <UCheckbox
              :model-value="attrs.showTotalLines === true"
              label="Show total lines in code header"
              @update:model-value="setCodeShowTotalLines"
            />
          </UFormField>
        </div>
      </details>

      <details v-if="blockName === 'horizontalRule'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Separator</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Line style">
            <USelect
              :model-value="String(attrs.styleType ?? 'solid')"
              :items="[{ label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' }]"
              @update:model-value="setSeparatorStyle"
            />
          </UFormField>
          <UFormField label="Thickness (px)">
            <UInput type="number" min="1" max="12" :model-value="Number(attrs.thickness ?? 1)" @update:model-value="setSeparatorThickness" />
          </UFormField>
          <UFormField label="Color palette">
            <div class="grid grid-cols-8 gap-1.5">
              <button
                v-for="color in separatorPalette"
                :key="`sep-${color}`"
                type="button"
                class="h-7 rounded border"
                :style="{ backgroundColor: color, borderColor: color === String(attrs.color ?? '#d6d3d1') ? '#0f766e' : '#d6d3d1' }"
                :title="color"
                @click="setSeparatorColor(color)"
              />
            </div>
          </UFormField>
          <details class="rounded-md border border-stone-200 p-2">
            <summary class="cursor-pointer text-xs font-medium text-stone-700">Advanced color (picker + RGB/HEX)</summary>
            <div class="mt-2 grid grid-cols-[auto,1fr] items-center gap-2">
              <input type="color" :value="String(attrs.color ?? '#d6d3d1')" class="h-9 w-12 rounded border border-stone-200" @input="setSeparatorColor(($event.target as HTMLInputElement).value)">
              <UInput :model-value="String(attrs.color ?? '#d6d3d1')" placeholder="#d6d3d1" @update:model-value="setSeparatorColorHex" />
            </div>
          </details>
          <UFormField label="Vertical margin (px)">
            <UInput type="number" min="0" max="120" :model-value="Number(attrs.marginY ?? 16)" @update:model-value="setSeparatorMargin" />
          </UFormField>
        </div>
      </details>

      <details v-if="blockName === 'preformatted'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Preformatted</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Text color palette">
            <div class="grid grid-cols-8 gap-1.5">
              <button
                v-for="color in preTextPalette"
                :key="`pt-${color}`"
                type="button"
                class="h-7 rounded border"
                :style="{ backgroundColor: color, borderColor: color === String(attrs.textColor ?? '#e7e5e4') ? '#0f766e' : '#d6d3d1' }"
                :title="color"
                @click="setPreTextColor(color)"
              />
            </div>
          </UFormField>
          <UFormField label="Background color palette">
            <div class="grid grid-cols-8 gap-1.5">
              <button
                v-for="color in preBackgroundPalette"
                :key="`pb-${color}`"
                type="button"
                class="h-7 rounded border"
                :style="{ backgroundColor: color, borderColor: color === String(attrs.backgroundColor ?? '#1c1917') ? '#0f766e' : '#d6d3d1' }"
                :title="color"
                @click="setPreBgColor(color)"
              />
            </div>
          </UFormField>
          <details class="rounded-md border border-stone-200 p-2">
            <summary class="cursor-pointer text-xs font-medium text-stone-700">Advanced colors (picker + RGB/HEX)</summary>
            <div class="mt-2 space-y-2">
              <div class="grid grid-cols-[auto,1fr] items-center gap-2">
                <input type="color" :value="String(attrs.textColor ?? '#e7e5e4')" class="h-9 w-12 rounded border border-stone-200" @input="setPreTextColor(($event.target as HTMLInputElement).value)">
                <UInput :model-value="String(attrs.textColor ?? '#e7e5e4')" placeholder="#e7e5e4" @update:model-value="setPreTextColorHex" />
              </div>
              <div class="grid grid-cols-[auto,1fr] items-center gap-2">
                <input type="color" :value="String(attrs.backgroundColor ?? '#1c1917')" class="h-9 w-12 rounded border border-stone-200" @input="setPreBgColor(($event.target as HTMLInputElement).value)">
                <UInput :model-value="String(attrs.backgroundColor ?? '#1c1917')" placeholder="#1c1917" @update:model-value="setPreBgColorHex" />
              </div>
            </div>
          </details>
          <UFormField label="Font size (px)">
            <UInput type="number" min="10" max="40" :model-value="Number(attrs.fontSize ?? 14)" @update:model-value="setPreFontSize" />
          </UFormField>
          <UFormField>
            <UCheckbox
              :model-value="attrs.lineNumbers !== false"
              label="Show line numbers"
              @update:model-value="setPreLineNumbers"
            />
          </UFormField>
          <UFormField label="Vertical margin (px)">
            <UInput type="number" min="0" max="120" :model-value="Number(attrs.marginY ?? 12)" @update:model-value="setPreMargin" />
          </UFormField>
        </div>
      </details>

      <details v-if="footnoteSection" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Footnotes</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Title">
            <UInput :model-value="footnoteTitle" @update:model-value="setFootnoteTitle" />
          </UFormField>
        </div>
      </details>

      <details v-if="blockName === 'customHtml'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Custom HTML</summary>
        <div class="mt-3 space-y-3">
          <UTextarea :model-value="String(attrs.html ?? '')" :rows="8" class="font-mono text-xs" @update:model-value="updateAttrs({ html: String($event) })" />
        </div>
      </details>

      <details v-if="blockName === 'mermaid'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Mermaid</summary>
        <div class="mt-3">
          <UTextarea :model-value="String(attrs.code ?? '')" :rows="8" @update:model-value="updateAttrs({ code: String($event) })" />
        </div>
      </details>

      <details v-if="blockName === 'table'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Table</summary>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <UButton type="button" icon="i-lucide-columns-3" size="sm" variant="soft" color="neutral" @click="runTableCommand('addColumnAfter')">Add column</UButton>
          <UButton type="button" icon="i-lucide-rows-3" size="sm" variant="soft" color="neutral" @click="runTableCommand('addRowAfter')">Add row</UButton>
          <UButton type="button" icon="i-lucide-trash-2" size="sm" variant="ghost" color="error" @click="runTableCommand('deleteColumn')">Delete column</UButton>
          <UButton type="button" icon="i-lucide-trash" size="sm" variant="ghost" color="error" @click="runTableCommand('deleteRow')">Delete row</UButton>
        </div>
      </details>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { CODE_BLOCK_LANGUAGES, CODE_BLOCK_THEMES } from '~/extensions/codeBlockEnhanced'

const props = defineProps<{
  editor: Editor | null
}>()

const editorStore = useEditorStore()
const blockRegistry = useBlockRegistry()

const blockName = computed(() => editorStore.selectedBlockType)
const attrs = computed(() => editorStore.selectedBlockAttrs)
const blockDefinition = computed(() => blockName.value ? blockRegistry.getBlockDefinition(blockName.value) : null)

const headingLevelItems = [
  { label: 'Heading 1', value: '1' },
  { label: 'Heading 2', value: '2' },
  { label: 'Heading 3', value: '3' },
  { label: 'Heading 4', value: '4' },
  { label: 'Heading 5', value: '5' },
  { label: 'Heading 6', value: '6' }
]

const languageItems = CODE_BLOCK_LANGUAGES.map((l) => ({ label: l.label, value: l.value as string }))
const themeItems = CODE_BLOCK_THEMES.map((t) => ({ label: t.label, value: t.value as string }))
const sourceSizeItems = [
  { label: 'Thumbnail', value: 'thumbnail' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large', value: 'large' },
  { label: 'Full / Original', value: 'full' }
]
const displaySizeItems = [
  { label: 'Natural / Auto', value: 'natural' },
  { label: 'Fill container', value: 'fill-container' },
  { label: 'Custom percent', value: 'custom-percent' },
  { label: 'Custom px', value: 'custom-px' }
]
const blockWidthItems = [
  { label: 'Content', value: 'content' },
  { label: 'Wide', value: 'wide' },
  { label: 'Full bleed', value: 'full-bleed' }
]
const ratioPresetItems = [
  { label: '30 / 70', value: '30' },
  { label: '40 / 60', value: '40' },
  { label: '50 / 50', value: '50' },
  { label: '60 / 40', value: '60' },
  { label: '70 / 30', value: '70' }
]

const separatorPalette = ['#d6d3d1', '#0f766e', '#1d4ed8', '#7c3aed', '#be123c', '#d97706', '#111827', '#9ca3af']
const preTextPalette = ['#fafaf9', '#e7e5e4', '#d1d5db', '#111827', '#0f172a', '#14532d', '#0f766e', '#1d4ed8', '#7c3aed', '#be123c', '#d97706', '#334155']
const preBackgroundPalette = ['#1c1917', '#0f172a', '#111827', '#0b3a2e', '#042f2e', '#172554', '#312e81', '#4c0519', '#7c2d12', '#f5f5f4', '#e5e7eb', '#dbeafe']

const imageSourceSize = computed(() => String(attrs.value.sourceSize ?? 'full'))
const imageDisplaySize = computed(() => {
  const explicit = String(attrs.value.displaySize ?? '')
  if (explicit) {
    return explicit
  }

  const percent = Number(attrs.value.widthPercent ?? 0)
  if (Number.isFinite(percent) && percent > 0 && percent !== 100) {
    return 'custom-percent'
  }

  const width = numberOrNull(attrs.value.width)
  return width ? 'custom-px' : 'fill-container'
})

const mediaSourceSize = computed(() => String(attrs.value.mediaSourceSize ?? 'full'))
const mediaDisplaySize = computed(() => {
  const explicit = String(attrs.value.mediaDisplaySize ?? '')
  if (explicit) {
    return explicit
  }

  const percent = Number(attrs.value.mediaWidthPercent ?? 0)
  if (Number.isFinite(percent) && percent > 0 && percent !== 100) {
    return 'custom-percent'
  }

  const width = numberOrNull(attrs.value.mediaWidth)
  return width ? 'custom-px' : 'fill-container'
})

const footnoteSection = computed(() => {
  const activeEditor = props.editor
  const selectedPos = editorStore.selectedBlockPos
  if (!activeEditor || selectedPos === null) return null

  const topLevel: Array<{ pos: number, node: any }> = []
  activeEditor.state.doc.forEach((node, pos) => {
    topLevel.push({ pos, node })
  })

  for (let i = 1; i < topLevel.length; i += 1) {
    const heading = topLevel[i - 1]
    const list = topLevel[i]
    if (!heading || !list) continue
    if (heading.node.type.name !== 'paragraph' || list.node.type.name !== 'orderedList') continue
    if (selectedPos !== heading.pos && selectedPos !== list.pos) continue
    return { headingPos: heading.pos, headingNode: heading.node, listPos: list.pos }
  }

  return null
})

const footnoteTitle = computed(() => {
  return footnoteSection.value?.headingNode?.textContent?.trim() || 'Footnotes'
})

function updateAttrs(nextAttrs: Record<string, unknown>) {
  const activeEditor = props.editor
  const activeBlockName = blockName.value

  if (!activeEditor || !activeBlockName) {
    return
  }

  const state = activeEditor.state
  const targetPos = resolveSelectedBlockPos(activeEditor, activeBlockName, editorStore.selectedBlockPos)

  if (targetPos !== null) {
    const node = state.doc.nodeAt(targetPos)
    if (!node || node.type.name !== activeBlockName) {
      return
    }

    const mergedAttrs = { ...node.attrs, ...nextAttrs }
    const tr = state.tr.setNodeMarkup(targetPos, undefined, mergedAttrs)
    tr.setMeta('addToHistory', true)
    activeEditor.view.dispatch(tr)
    editorStore.mergeSelectedBlockAttrs(nextAttrs)
    return
  }

  const updated = activeEditor.chain().updateAttributes(activeBlockName, nextAttrs).run()
  if (updated) {
    editorStore.mergeSelectedBlockAttrs(nextAttrs)
  }
}

function resolveSelectedBlockPos(editor: Editor, blockType: string, storePos: number | null) {
  const candidates = new Set<number>()

  if (typeof storePos === 'number') {
    candidates.add(Math.max(0, Math.min(storePos, editor.state.doc.content.size)))
  }

  const selectionPos = topLevelSelectionPos(editor)
  if (selectionPos !== null) {
    candidates.add(selectionPos)
  }

  const idPos = selectedBlockIdPos()
  if (idPos !== null) {
    candidates.add(idPos)
  }

  for (const pos of candidates) {
    const node = editor.state.doc.nodeAt(pos)
    if (node?.type.name === blockType) {
      return pos
    }
  }

  return null
}

function selectedBlockIdPos() {
  const id = editorStore.selectedBlockId
  if (!id || typeof id !== 'string') {
    return null
  }

  const match = id.match(/:(\d+)$/)
  if (!match) {
    return null
  }

  return Number(match[1])
}

function topLevelSelectionPos(editor: Editor) {
  const { $from } = editor.state.selection

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth - 1).type.name === 'doc') {
      return $from.before(depth)
    }
  }

  return null
}

function asSelectValue(value: unknown, fallback: string) {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object') {
    const maybeValue = (value as { value?: unknown }).value
    if (typeof maybeValue === 'string') {
      return maybeValue
    }
  }

  return fallback
}

function asInputValue(value: unknown, fallback = '') {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object') {
    const target = (value as { target?: { value?: unknown } }).target
    if (target && typeof target.value === 'string') {
      return target.value
    }
    const maybeValue = (value as { value?: unknown }).value
    if (typeof maybeValue === 'string') {
      return maybeValue
    }
  }

  return fallback
}

function asBooleanValue(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }

  if (value && typeof value === 'object') {
    const target = (value as { target?: { checked?: unknown } }).target
    if (target && typeof target.checked === 'boolean') {
      return target.checked
    }

    const maybeChecked = (value as { checked?: unknown }).checked
    if (typeof maybeChecked === 'boolean') {
      return maybeChecked
    }
  }

  return fallback
}

function setCodeFileName(value: unknown) {
  updateAttrs({ fileName: asInputValue(value, '') })
}

function setCodeLanguage(value: unknown) {
  updateAttrs({ language: asSelectValue(value, 'text') })
}

function setCodeTheme(value: unknown) {
  updateAttrs({ theme: asSelectValue(value, 'github-dark') })
}

function setCodeLineNumbers(value: unknown) {
  updateAttrs({ lineNumbers: asBooleanValue(value, true) })
}

function setCodeShowTotalLines(value: unknown) {
  updateAttrs({ showTotalLines: asBooleanValue(value, false) })
}

function setSeparatorStyle(value: unknown) {
  updateAttrs({ styleType: asSelectValue(value, 'solid') })
}

function setSeparatorThickness(value: unknown) {
  const thickness = Math.max(1, Math.min(12, Number(value) || 1))
  updateAttrs({ thickness })
}

function setSeparatorMargin(value: unknown) {
  const marginY = Math.max(0, Math.min(120, Number(value) || 0))
  updateAttrs({ marginY })
}

function setSeparatorColor(value: string) {
  updateAttrs({ color: value || '#d6d3d1' })
}

function setSeparatorColorHex(value: unknown) {
  const next = String(value ?? '').trim()
  if (isHexColor(next)) {
    setSeparatorColor(next)
  }
}

function setPreTextColor(value: string) {
  updateAttrs({ textColor: value || '#e7e5e4' })
}

function setPreTextColorHex(value: unknown) {
  const next = String(value ?? '').trim()
  if (isHexColor(next)) {
    setPreTextColor(next)
  }
}

function setPreBgColor(value: string) {
  updateAttrs({ backgroundColor: value || '#1c1917' })
}

function setPreBgColorHex(value: unknown) {
  const next = String(value ?? '').trim()
  if (isHexColor(next)) {
    setPreBgColor(next)
  }
}

function setPreFontSize(value: unknown) {
  const fontSize = Math.max(10, Math.min(40, Number(value) || 14))
  updateAttrs({ fontSize })
}

function setPreMargin(value: unknown) {
  const marginY = Math.max(0, Math.min(120, Number(value) || 0))
  updateAttrs({ marginY })
}

function setPreLineNumbers(value: unknown) {
  updateAttrs({ lineNumbers: asBooleanValue(value, true) })
}

function setFootnoteTitle(value: unknown) {
  const activeEditor = props.editor
  const section = footnoteSection.value
  if (!activeEditor || !section) return

  const title = asInputValue(value, 'Footnotes').trim() || 'Footnotes'
  const from = section.headingPos + 1
  const to = section.headingPos + section.headingNode.nodeSize - 1
  const tr = activeEditor.state.tr.insertText(title, from, to)
  activeEditor.view.dispatch(tr)
}

function isHexColor(value: string) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
}

function setHeadingLevel(value: string | number) {
  updateAttrs({ level: Number(value) })
}

function numberOrNull(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    return null
  }

  return n
}

function percentOrNull(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    return null
  }

  return Math.max(1, Math.min(200, Math.round(n)))
}

function aspectRatioFrom(currentWidth: unknown, currentHeight: unknown) {
  const width = numberOrNull(currentWidth)
  const height = numberOrNull(currentHeight)
  if (!width || !height) {
    return null
  }

  return width / height
}

function derivePercent(size: number | null, natural: number | null) {
  if (!size || !natural || natural <= 0) {
    return 100
  }

  return Math.max(1, Math.min(200, Math.round((size / natural) * 100)))
}

function imageNaturalDims() {
  const naturalWidth = numberOrNull(attrs.value.naturalWidth ?? attrs.value.width)
  const naturalHeight = numberOrNull(attrs.value.naturalHeight ?? attrs.value.height)
  return { naturalWidth, naturalHeight }
}

function mediaNaturalDims() {
  const mediaNaturalWidth = numberOrNull(attrs.value.mediaNaturalWidth ?? attrs.value.mediaWidth)
  const mediaNaturalHeight = numberOrNull(attrs.value.mediaNaturalHeight ?? attrs.value.mediaHeight)
  return { mediaNaturalWidth, mediaNaturalHeight }
}

function setImageSourceSize(value: unknown) {
  updateAttrs({ sourceSize: asSelectValue(value, 'full') })
}

function setImageDisplaySize(value: unknown) {
  const displaySize = asSelectValue(value, 'fill-container')
  updateAttrs({ displaySize })
}

function setImageWidth(value: unknown) {
  const width = numberOrNull(value)
  const lockAspect = attrs.value.lockAspect !== false
  const ratio = aspectRatioFrom(attrs.value.naturalWidth, attrs.value.naturalHeight) ?? aspectRatioFrom(attrs.value.width, attrs.value.height)
  const { naturalWidth, naturalHeight } = imageNaturalDims()

  if (lockAspect && width && ratio) {
    const height = Math.round(width / ratio)
    updateAttrs({
      displaySize: 'custom-px',
      displayPx: width,
      width,
      height,
      displayPercent: derivePercent(width, naturalWidth),
      widthPercent: derivePercent(width, naturalWidth),
      naturalWidth: naturalWidth ?? width,
      naturalHeight: naturalHeight ?? height
    })
    return
  }

  updateAttrs({
    displaySize: 'custom-px',
    displayPx: width,
    width,
    displayPercent: derivePercent(width, naturalWidth),
    widthPercent: derivePercent(width, naturalWidth),
    naturalWidth: naturalWidth ?? width
  })
}

function setImageHeight(value: unknown) {
  const height = numberOrNull(value)
  const lockAspect = attrs.value.lockAspect !== false
  const ratio = aspectRatioFrom(attrs.value.naturalWidth, attrs.value.naturalHeight) ?? aspectRatioFrom(attrs.value.width, attrs.value.height)
  const { naturalWidth, naturalHeight } = imageNaturalDims()

  if (lockAspect && height && ratio) {
    const width = Math.round(height * ratio)
    updateAttrs({
      displaySize: 'custom-px',
      displayPx: width,
      height,
      width,
      displayPercent: derivePercent(width, naturalWidth),
      widthPercent: derivePercent(width, naturalWidth),
      naturalHeight: naturalHeight ?? height,
      naturalWidth: naturalWidth ?? width
    })
    return
  }

  updateAttrs({
    displaySize: 'custom-px',
    height,
    displayPercent: derivePercent(height, naturalHeight),
    widthPercent: derivePercent(height, naturalHeight),
    naturalHeight: naturalHeight ?? height
  })
}

function setImageDisplayPercent(value: unknown) {
  const widthPercent = percentOrNull(value)
  if (!widthPercent) {
    return
  }

  const { naturalWidth, naturalHeight } = imageNaturalDims()
  if (!naturalWidth || !naturalHeight) {
    updateAttrs({ displaySize: 'custom-percent', displayPercent: widthPercent, widthPercent })
    return
  }

  const width = Math.round((naturalWidth * widthPercent) / 100)
  const height = Math.round((naturalHeight * widthPercent) / 100)
  updateAttrs({
    displaySize: 'custom-percent',
    displayPercent: widthPercent,
    widthPercent,
    width,
    height,
    naturalWidth,
    naturalHeight
  })
}

function setMediaSourceSize(value: unknown) {
  updateAttrs({ mediaSourceSize: asSelectValue(value, 'full') })
}

function setMediaDisplaySize(value: unknown) {
  const mediaDisplaySize = asSelectValue(value, 'fill-container')
  updateAttrs({ mediaDisplaySize })
}

function setMediaWidth(value: unknown) {
  const mediaWidth = numberOrNull(value)
  const lockAspect = attrs.value.lockAspect !== false
  const ratio = aspectRatioFrom(attrs.value.mediaNaturalWidth, attrs.value.mediaNaturalHeight) ?? aspectRatioFrom(attrs.value.mediaWidth, attrs.value.mediaHeight)
  const { mediaNaturalWidth, mediaNaturalHeight } = mediaNaturalDims()

  if (lockAspect && mediaWidth && ratio) {
    const mediaHeight = Math.round(mediaWidth / ratio)
    updateAttrs({
      mediaDisplaySize: 'custom-px',
      mediaDisplayPx: mediaWidth,
      mediaWidth,
      mediaHeight,
      mediaDisplayPercent: derivePercent(mediaWidth, mediaNaturalWidth),
      mediaWidthPercent: derivePercent(mediaWidth, mediaNaturalWidth),
      mediaNaturalWidth: mediaNaturalWidth ?? mediaWidth,
      mediaNaturalHeight: mediaNaturalHeight ?? mediaHeight
    })
    return
  }

  updateAttrs({
    mediaDisplaySize: 'custom-px',
    mediaDisplayPx: mediaWidth,
    mediaWidth,
    mediaDisplayPercent: derivePercent(mediaWidth, mediaNaturalWidth),
    mediaWidthPercent: derivePercent(mediaWidth, mediaNaturalWidth),
    mediaNaturalWidth: mediaNaturalWidth ?? mediaWidth
  })
}

function setMediaHeight(value: unknown) {
  const mediaHeight = numberOrNull(value)
  const lockAspect = attrs.value.lockAspect !== false
  const ratio = aspectRatioFrom(attrs.value.mediaNaturalWidth, attrs.value.mediaNaturalHeight) ?? aspectRatioFrom(attrs.value.mediaWidth, attrs.value.mediaHeight)
  const { mediaNaturalWidth, mediaNaturalHeight } = mediaNaturalDims()

  if (lockAspect && mediaHeight && ratio) {
    const mediaWidth = Math.round(mediaHeight * ratio)
    updateAttrs({
      mediaDisplaySize: 'custom-px',
      mediaDisplayPx: mediaWidth,
      mediaHeight,
      mediaWidth,
      mediaDisplayPercent: derivePercent(mediaWidth, mediaNaturalWidth),
      mediaWidthPercent: derivePercent(mediaWidth, mediaNaturalWidth),
      mediaNaturalHeight: mediaNaturalHeight ?? mediaHeight,
      mediaNaturalWidth: mediaNaturalWidth ?? mediaWidth
    })
    return
  }

  updateAttrs({
    mediaDisplaySize: 'custom-px',
    mediaHeight,
    mediaDisplayPercent: derivePercent(mediaHeight, mediaNaturalHeight),
    mediaWidthPercent: derivePercent(mediaHeight, mediaNaturalHeight),
    mediaNaturalHeight: mediaNaturalHeight ?? mediaHeight
  })
}

function setMediaDisplayPercent(value: unknown) {
  const mediaWidthPercent = percentOrNull(value)
  if (!mediaWidthPercent) {
    return
  }

  const { mediaNaturalWidth, mediaNaturalHeight } = mediaNaturalDims()
  if (!mediaNaturalWidth || !mediaNaturalHeight) {
    updateAttrs({ mediaDisplaySize: 'custom-percent', mediaDisplayPercent: mediaWidthPercent, mediaWidthPercent })
    return
  }

  const mediaWidth = Math.round((mediaNaturalWidth * mediaWidthPercent) / 100)
  const mediaHeight = Math.round((mediaNaturalHeight * mediaWidthPercent) / 100)
  updateAttrs({
    mediaDisplaySize: 'custom-percent',
    mediaDisplayPercent: mediaWidthPercent,
    mediaWidthPercent,
    mediaWidth,
    mediaHeight,
    mediaNaturalWidth,
    mediaNaturalHeight
  })
}

function setMediaRatioPreset(value: unknown) {
  const raw = Number(asSelectValue(value, '50'))
  if (!Number.isFinite(raw)) {
    return
  }

  const ratio = Math.max(15, Math.min(85, Math.round(raw))) / 100
  updateAttrs({ ratio })
}

function setImageLockAspect(value: unknown) {
  const lockAspect = asBooleanValue(value, true)
  if (!lockAspect) {
    updateAttrs({ lockAspect })
    return
  }

  const { naturalWidth, naturalHeight } = imageNaturalDims()
  const width = numberOrNull(attrs.value.width)
  if (naturalWidth && naturalHeight && width) {
    updateAttrs({
      lockAspect,
      height: Math.round((width / naturalWidth) * naturalHeight),
      widthPercent: derivePercent(width, naturalWidth),
      naturalWidth,
      naturalHeight
    })
    return
  }

  updateAttrs({ lockAspect })
}

function setMediaLockAspect(value: unknown) {
  const lockAspect = asBooleanValue(value, true)
  if (!lockAspect) {
    updateAttrs({ lockAspect })
    return
  }

  const { mediaNaturalWidth, mediaNaturalHeight } = mediaNaturalDims()
  const mediaWidth = numberOrNull(attrs.value.mediaWidth)
  if (mediaNaturalWidth && mediaNaturalHeight && mediaWidth) {
    updateAttrs({
      lockAspect,
      mediaHeight: Math.round((mediaWidth / mediaNaturalWidth) * mediaNaturalHeight),
      mediaWidthPercent: derivePercent(mediaWidth, mediaNaturalWidth),
      mediaNaturalWidth,
      mediaNaturalHeight
    })
    return
  }

  updateAttrs({ lockAspect })
}

function runTableCommand(command: 'addColumnAfter' | 'addRowAfter' | 'deleteColumn' | 'deleteRow') {
  const activeEditor = props.editor
  if (!activeEditor) {
    return
  }

  const chain = activeEditor.chain().focus() as any
  chain[command]().run()
}
</script>
