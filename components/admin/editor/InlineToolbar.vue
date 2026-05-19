<template>
  <BubbleMenu
    v-if="editor"
    :editor="editor"
    :tippy-options="bubbleTippyOptions"
    :should-show="shouldShow"
  >
    <div class="flex items-center gap-1 rounded-md border border-stone-200 bg-white p-1 shadow-lg" data-testid="inline-formatting-toolbar">
      <UTooltip text="Bold">
        <UButton type="button" icon="i-lucide-bold" size="xs" :color="editor.isActive('bold') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="editor.chain().focus().toggleBold().run()" />
      </UTooltip>
      <UTooltip text="Italic">
        <UButton type="button" icon="i-lucide-italic" size="xs" :color="editor.isActive('italic') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="editor.chain().focus().toggleItalic().run()" />
      </UTooltip>
      <UTooltip text="Strikethrough">
        <UButton type="button" icon="i-lucide-strikethrough" size="xs" :color="editor.isActive('strike') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="editor.chain().focus().toggleStrike().run()" />
      </UTooltip>
      <UTooltip text="Inline code">
        <UButton type="button" icon="i-lucide-code" size="xs" :color="editor.isActive('code') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="editor.chain().focus().toggleCode().run()" />
      </UTooltip>
      <USeparator orientation="vertical" class="h-6" />
      <UTooltip text="Link">
        <UButton type="button" icon="i-lucide-link" size="xs" :color="editor.isActive('link') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="setLink" />
      </UTooltip>
      <label class="flex size-7 cursor-pointer items-center justify-center rounded text-stone-600 hover:bg-stone-100" title="Text color" @mousedown.prevent>
        <UIcon name="i-lucide-palette" class="size-4" />
        <input type="color" class="sr-only" @input="setTextColor">
      </label>
      <label class="flex size-7 cursor-pointer items-center justify-center rounded text-stone-600 hover:bg-stone-100" title="Highlight" @mousedown.prevent>
        <UIcon name="i-lucide-highlighter" class="size-4" />
        <input type="color" class="sr-only" @input="setHighlight">
      </label>
    </div>
  </BubbleMenu>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/vue-3'

const props = defineProps<{
  editor: Editor | null
}>()

const bubbleTippyOptions = {
  appendTo: () => document.body,
  duration: 120,
  interactive: true,
  placement: 'top' as const
}

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
  const href = window.prompt('URL', previousHref ?? 'https://')

  if (href === null) {
    return
  }

  if (!href.trim()) {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }

  editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
}

function setTextColor(event: Event) {
  const value = (event.target as HTMLInputElement).value
  props.editor?.chain().focus().setColor(value).run()
}

function setHighlight(event: Event) {
  const value = (event.target as HTMLInputElement).value
  props.editor?.chain().focus().toggleHighlight({ color: value }).run()
}
</script>