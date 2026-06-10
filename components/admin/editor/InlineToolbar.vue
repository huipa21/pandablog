<template>
  <BubbleMenu
    v-if="editor"
    :editor="editor"
    :tippy-options="bubbleTippyOptions"
    :should-show="shouldShow"
  >
    <div class="flex items-center gap-1 rounded-md border border-stone-200 bg-white p-1 shadow-lg" data-testid="inline-formatting-toolbar">
      <UTooltip :text="t('admin.editor.toolbar.bold')">
        <UButton type="button" icon="i-lucide-bold" size="xs" :color="editor.isActive('bold') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="editor.chain().focus().toggleBold().run()" />
      </UTooltip>
      <UTooltip :text="t('admin.editor.toolbar.italic')">
        <UButton type="button" icon="i-lucide-italic" size="xs" :color="editor.isActive('italic') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="editor.chain().focus().toggleItalic().run()" />
      </UTooltip>
      <UTooltip :text="t('admin.editor.toolbar.strikethrough')">
        <UButton type="button" icon="i-lucide-strikethrough" size="xs" :color="editor.isActive('strike') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="editor.chain().focus().toggleStrike().run()" />
      </UTooltip>
      <UTooltip :text="t('admin.editor.toolbar.inlineCode')">
        <UButton type="button" icon="i-lucide-code" size="xs" :color="editor.isActive('code') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="editor.chain().focus().toggleCode().run()" />
      </UTooltip>
      <USeparator orientation="vertical" class="h-6" />
      <UTooltip :text="t('admin.editor.toolbar.link')">
        <UButton type="button" icon="i-lucide-link" size="xs" :color="editor.isActive('link') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="setLink" />
      </UTooltip>
      <label class="flex size-7 cursor-pointer items-center justify-center rounded text-stone-600 hover:bg-stone-100" :title="t('admin.editor.toolbar.textColor')" @mousedown.prevent>
        <UIcon name="i-lucide-palette" class="size-4" />
        <input type="color" class="sr-only" @input="setTextColor">
      </label>
      <div class="flex items-center gap-0.5 rounded px-0.5" :title="t('admin.editor.toolbar.highlight')">
        <UIcon name="i-lucide-highlighter" class="size-4" />
        <button
          v-for="color in highlightColors"
          :key="color.value"
          type="button"
          class="size-5 rounded border border-stone-300"
          :style="{ backgroundColor: color.value }"
          :aria-label="t('admin.editor.toolbar.highlightColor', { label: color.label })"
          :title="t('admin.editor.toolbar.highlightColor', { label: color.label })"
          @mousedown.prevent="setHighlight(color.value)"
        />
        <button type="button" class="flex size-6 items-center justify-center rounded text-stone-600 hover:bg-stone-100" :title="t('admin.editor.toolbar.removeHighlight')" @mousedown.prevent="unsetHighlight">
          <UIcon name="i-lucide-eraser" class="size-3.5" />
        </button>
      </div>
    </div>
  </BubbleMenu>

  <AdminPromptDialog
    :open="linkDialogOpen"
    :title="t('admin.editor.toolbar.editLink')"
    :description="t('admin.editor.toolbar.editLinkRemoveDescription')"
    :label="t('admin.editor.toolbar.url')"
    placeholder="https://example.com"
    :initial-value="linkInitialHref"
    input-type="url"
    :confirm-label="t('admin.editor.toolbar.applyLink')"
    :required="false"
    @update:open="(value) => { if (!value) linkDialogOpen = false }"
    @cancel="linkDialogOpen = false"
    @confirm="confirmLink"
  />
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/vue-3'
import { HIGHLIGHT_COLORS } from '~/utils/highlightColors'

const props = defineProps<{
  editor: Editor | null
}>()

const { t } = useI18n()
const bubbleTippyOptions = {
  appendTo: () => document.body,
  duration: 120,
  interactive: true,
  placement: 'top' as const
}
const highlightColors = HIGHLIGHT_COLORS
const linkDialogOpen = ref(false)
const linkInitialHref = ref('')

function shouldShow({ editor }: { editor: Editor }) {
  const { empty } = editor.state.selection
  return editor.isFocused && !empty && !editor.isActive('codeBlock')
}

function setLink() {
  const editor = props.editor
  if (!editor) {
    return
  }

  const previousHref = editor.getAttributes('link').href as string | undefined
  linkInitialHref.value = previousHref ?? 'https://'
  linkDialogOpen.value = true
}

function confirmLink(href: string) {
  const editor = props.editor
  if (!editor) {
    linkDialogOpen.value = false
    return
  }

  linkDialogOpen.value = false

  if (!href) {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }

  editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
}

function setTextColor(event: Event) {
  const value = (event.target as HTMLInputElement).value
  props.editor?.chain().focus().setColor(value).run()
}

function setHighlight(color: string) {
  ;(props.editor?.chain().focus() as any)?.setHighlight({ color }).run()
}

function unsetHighlight() {
  ;(props.editor?.chain().focus() as any)?.unsetHighlight().run()
}
</script>