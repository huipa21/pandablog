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

      <details open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Layout</summary>
        <div class="mt-3 space-y-3">
          <div v-if="supportsAlignment" class="space-y-2">
            <label class="text-xs font-medium uppercase tracking-wider text-stone-500">Alignment</label>
            <div class="flex gap-1">
              <UButton type="button" icon="i-lucide-align-left" size="xs" color="neutral" variant="soft" @click="setTextAlign('left')" />
              <UButton type="button" icon="i-lucide-align-center" size="xs" color="neutral" variant="soft" @click="setTextAlign('center')" />
              <UButton type="button" icon="i-lucide-align-right" size="xs" color="neutral" variant="soft" @click="setTextAlign('right')" />
            </div>
          </div>

          <UFormField v-if="blockName === 'heading'" label="Heading level">
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
          <div class="grid grid-cols-2 gap-2">
            <UFormField label="Width (px)">
              <UInput type="number" :model-value="(attrs.width as number | null) ?? undefined" @update:model-value="updateAttrs({ width: Number($event) || null })" />
            </UFormField>
            <UFormField label="Height (px)">
              <UInput type="number" :model-value="(attrs.height as number | null) ?? undefined" @update:model-value="updateAttrs({ height: Number($event) || null })" />
            </UFormField>
          </div>
          <UFormField>
            <UCheckbox
              :model-value="attrs.lockAspect !== false"
              label="Maintain aspect ratio"
              @update:model-value="updateAttrs({ lockAspect: Boolean($event) })"
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
          <div class="grid grid-cols-2 gap-2">
            <UFormField label="Width (px)">
              <UInput type="number" :model-value="(attrs.mediaWidth as number | null) ?? undefined" @update:model-value="updateAttrs({ mediaWidth: Number($event) || null })" />
            </UFormField>
            <UFormField label="Height (px)">
              <UInput type="number" :model-value="(attrs.mediaHeight as number | null) ?? undefined" @update:model-value="updateAttrs({ mediaHeight: Number($event) || null })" />
            </UFormField>
          </div>
          <UFormField>
            <UCheckbox
              :model-value="attrs.lockAspect !== false"
              label="Maintain aspect ratio"
              @update:model-value="updateAttrs({ lockAspect: Boolean($event) })"
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
const supportsAlignment = computed(() => Boolean(blockDefinition.value?.supports.align) || blockName.value === 'paragraph' || blockName.value === 'heading')

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

function updateAttrs(nextAttrs: Record<string, unknown>) {
  const activeEditor = props.editor
  const activeBlockName = blockName.value
  const activeBlockPos = editorStore.selectedBlockPos

  if (!activeEditor || !activeBlockName) {
    return
  }

  const state = activeEditor.state
  const targetPos = resolveSelectedBlockPos(activeEditor, activeBlockName, activeBlockPos)
  let updated = false

  if (targetPos !== null) {
    // Primary path: move selection to the exact node then use tiptap command,
    // which keeps node views and extension attrs in sync.
    updated = activeEditor
      .chain()
      .focus()
      .setNodeSelection(targetPos)
      .updateAttributes(activeBlockName, nextAttrs)
      .run()

    // Fallback: direct transaction in case command-based update is rejected.
    if (!updated) {
      const node = state.doc.nodeAt(targetPos)
      if (!node) {
        return
      }

      const tr = state.tr.setNodeMarkup(targetPos, undefined, {
        ...node.attrs,
        ...nextAttrs
      })
      activeEditor.view.dispatch(tr)
      updated = true
    }
  } else {
    updated = activeEditor.chain().focus().updateAttributes(activeBlockName, nextAttrs).run()
  }

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

function setHeadingLevel(value: string | number) {
  updateAttrs({ level: Number(value) })
}

function setTextAlign(value: 'left' | 'center' | 'right') {
  const activeEditor = props.editor
  if (!activeEditor) {
    return
  }

  ;(activeEditor.chain().focus() as any).setTextAlign(value).run()
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
