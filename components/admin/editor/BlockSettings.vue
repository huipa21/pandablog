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
        </div>
      </details>

      <details v-if="blockName === 'codeBlock'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Code</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Language">
            <USelect :model-value="String(attrs.language ?? 'text')" :items="languageItems" @update:model-value="updateAttrs({ language: String($event) })" />
          </UFormField>
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

      <details class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Advanced</summary>
        <div class="mt-3 space-y-2 text-sm text-stone-500">
          <p>Typography, spacing, color, and border controls are registered here for the block settings tab and will be expanded block-by-block.</p>
        </div>
      </details>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core'

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

const languageItems = [
  { label: 'Text', value: 'text' },
  { label: 'TypeScript', value: 'ts' },
  { label: 'JavaScript', value: 'js' },
  { label: 'Vue', value: 'vue' },
  { label: 'HTML', value: 'html' },
  { label: 'CSS', value: 'css' },
  { label: 'JSON', value: 'json' },
  { label: 'SQL', value: 'sql' },
  { label: 'Bash', value: 'bash' }
]

function updateAttrs(nextAttrs: Record<string, unknown>) {
  const activeEditor = props.editor
  const activeBlockName = blockName.value

  if (!activeEditor || !activeBlockName) {
    return
  }

  activeEditor.chain().focus().updateAttributes(activeBlockName, nextAttrs).run()
  editorStore.mergeSelectedBlockAttrs(nextAttrs)
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