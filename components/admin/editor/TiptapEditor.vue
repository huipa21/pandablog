<template>
  <div class="overflow-hidden rounded-lg border border-stone-200 bg-white">
    <div class="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-stone-50 p-2">
      <USelect v-model="blockStyle" :items="blockItems" size="sm" class="w-36" @update:model-value="setBlockStyle" />
      <USeparator orientation="vertical" class="h-8" />

      <UTooltip text="Bold">
        <UButton type="button" icon="i-lucide-bold" size="sm" :color="isActive('bold') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="runCommand('toggleBold')" />
      </UTooltip>
      <UTooltip text="Italic">
        <UButton type="button" icon="i-lucide-italic" size="sm" :color="isActive('italic') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="runCommand('toggleItalic')" />
      </UTooltip>
      <UTooltip text="Strike">
        <UButton type="button" icon="i-lucide-strikethrough" size="sm" :color="isActive('strike') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="runCommand('toggleStrike')" />
      </UTooltip>
      <UTooltip text="Link">
        <UButton type="button" icon="i-lucide-link" size="sm" :color="isActive('link') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="setLink" />
      </UTooltip>

      <USeparator orientation="vertical" class="h-8" />
      <UTooltip text="Bullet list">
        <UButton type="button" icon="i-lucide-list" size="sm" :color="isActive('bulletList') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="runCommand('toggleBulletList')" />
      </UTooltip>
      <UTooltip text="Numbered list">
        <UButton type="button" icon="i-lucide-list-ordered" size="sm" :color="isActive('orderedList') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="runCommand('toggleOrderedList')" />
      </UTooltip>
      <UTooltip text="Quote">
        <UButton type="button" icon="i-lucide-quote" size="sm" :color="isActive('blockquote') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="runCommand('toggleBlockquote')" />
      </UTooltip>

      <USeparator orientation="vertical" class="h-8" />
      <USelect v-model="codeLanguage" :items="languageItems" size="sm" class="w-32" />
      <UTooltip text="Code block">
        <UButton type="button" icon="i-lucide-square-code" size="sm" :color="isActive('codeBlock') ? 'primary' : 'neutral'" variant="ghost" @mousedown.prevent="toggleCodeBlock" />
      </UTooltip>
      <UTooltip text="Mermaid">
        <UButton type="button" icon="i-lucide-git-fork" size="sm" variant="ghost" color="neutral" @mousedown.prevent="insertMermaid" />
      </UTooltip>
      <UTooltip text="Image">
        <UButton type="button" icon="i-lucide-image-plus" size="sm" variant="ghost" color="neutral" :loading="uploading" @mousedown.prevent="openImagePicker" />
      </UTooltip>
      <MediaPicker
        :open="mediaPickerOpen"
        return-value="url"
        type-filter="image"
        @update:open="mediaPickerOpen = $event"
        @select="handleMediaPicked"
      />

      <div class="relative min-w-52 flex-1">
        <UInput
          v-model="wikiQuery"
          size="sm"
          icon="i-lucide-brackets"
          placeholder="Wiki link"
          @focus="showWikiSuggestions = true"
          @keydown.enter.prevent="insertWikiLinkFromQuery"
        />
        <div v-if="showWikiSuggestions && wikiSuggestions.length" class="absolute left-0 right-0 top-10 z-20 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg">
          <button
            v-for="item in wikiSuggestions"
            :key="`${item.type}:${item.target}`"
            type="button"
            class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-stone-50"
            @mousedown.prevent="insertWikiLink(item.label, item.target)"
          >
            <span class="font-medium text-stone-800">{{ item.label }}</span>
            <span class="text-xs uppercase tracking-wider text-stone-400">{{ item.type }}</span>
          </button>
        </div>
      </div>
    </div>

    <ClientOnly>
      <EditorContent v-if="editor" :editor="editor" class="tiptap-editor" />
      <template #fallback>
        <div class="min-h-96 p-5 text-sm text-stone-500">Loading editor...</div>
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { EditorContent, useEditor, VueNodeViewRenderer } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import TextAlign from '@tiptap/extension-text-align'
import { common, createLowlight } from 'lowlight'
import type { JsonContent, MediaRecord } from '~/types/content'
import { MermaidNode } from '~/extensions/mermaid'
import { normalizeWikiTarget, WikiLinkNode } from '~/extensions/wikiLink'
import MermaidNodeView from '~/components/admin/editor/MermaidNodeView.vue'
import WikiLinkNodeView from '~/components/admin/editor/WikiLinkNodeView.vue'
import MediaPicker from '~/components/admin/media/MediaPicker.vue'

const props = defineProps<{
  modelValue: JsonContent
}>()

const emit = defineEmits<{
  'update:modelValue': [value: JsonContent]
}>()

interface WikiSuggestion {
  type: 'concept' | 'post'
  label: string
  target: string
  href: string
}

const lowlight = createLowlight(common)
const uploading = ref(false)
const mediaPickerOpen = ref(false)
const codeLanguage = ref('ts')
const wikiQuery = ref('')
const wikiSuggestions = ref<WikiSuggestion[]>([])
const showWikiSuggestions = ref(false)
let wikiSearchTimer: ReturnType<typeof setTimeout> | undefined

const blockItems = [
  { label: 'Paragraph', value: 'paragraph' },
  { label: 'Heading 1', value: 'heading-1' },
  { label: 'Heading 2', value: 'heading-2' },
  { label: 'Heading 3', value: 'heading-3' }
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

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit.configure({
      codeBlock: false
    }),
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: 'text'
    }),
    Image.configure({
      allowBase64: false,
      inline: false
    }),
    Link.configure({
      autolink: true,
      linkOnPaste: true,
      openOnClick: false,
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow'
      }
    }),
    Placeholder.configure({
      placeholder: 'Start writing...'
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph']
    }),
    MermaidNode.extend({
      addNodeView() {
        return VueNodeViewRenderer(MermaidNodeView)
      }
    }),
    WikiLinkNode.extend({
      addNodeView() {
        return VueNodeViewRenderer(WikiLinkNodeView)
      }
    })
  ],
  editorProps: {
    handlePaste(_view, event) {
      return uploadImagesFromList(event.clipboardData?.files)
    },
    handleDrop(_view, event) {
      const handled = uploadImagesFromList(event.dataTransfer?.files)

      if (handled) {
        event.preventDefault()
      }

      return handled
    }
  },
  onUpdate({ editor: activeEditor }) {
    emit('update:modelValue', activeEditor.getJSON() as JsonContent)
  }
})

const blockStyle = computed({
  get() {
    if (editor.value?.isActive('heading', { level: 1 })) {
      return 'heading-1'
    }

    if (editor.value?.isActive('heading', { level: 2 })) {
      return 'heading-2'
    }

    if (editor.value?.isActive('heading', { level: 3 })) {
      return 'heading-3'
    }

    return 'paragraph'
  },
  set(value: string) {
    setBlockStyle(value)
  }
})

watch(() => props.modelValue, (value) => {
  const activeEditor = editor.value

  if (!activeEditor || !value) {
    return
  }

  if (JSON.stringify(activeEditor.getJSON()) !== JSON.stringify(value)) {
    activeEditor.commands.setContent(value, false)
  }
}, { deep: true })

watch(wikiQuery, (value) => {
  if (wikiSearchTimer) {
    clearTimeout(wikiSearchTimer)
  }

  wikiSearchTimer = setTimeout(() => {
    void fetchWikiSuggestions(value)
  }, 180)
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

function isActive(name: string, attrs?: Record<string, unknown>) {
  return editor.value?.isActive(name, attrs) ?? false
}

function runCommand(command: 'toggleBold' | 'toggleItalic' | 'toggleStrike' | 'toggleBulletList' | 'toggleOrderedList' | 'toggleBlockquote') {
  editor.value?.chain().focus()[command]().run()
}

function setBlockStyle(value: string) {
  const chain = editor.value?.chain().focus()

  if (!chain) {
    return
  }

  if (value === 'paragraph') {
    chain.setParagraph().run()
    return
  }

  const level = Number(value.replace('heading-', '')) as 1 | 2 | 3
  chain.toggleHeading({ level }).run()
}

function setLink() {
  const activeEditor = editor.value

  if (!activeEditor) {
    return
  }

  const previousHref = activeEditor.getAttributes('link').href as string | undefined
  const href = window.prompt('URL', previousHref ?? 'https://')

  if (href === null) {
    return
  }

  if (!href.trim()) {
    activeEditor.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }

  activeEditor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
}

function toggleCodeBlock() {
  editor.value?.chain().focus().toggleCodeBlock({ language: codeLanguage.value }).run()
}

function insertMermaid() {
  const code = window.prompt('Mermaid diagram', 'graph TD;\n  A[Idea] --> B[Connection]')

  if (!code?.trim()) {
    return
  }

  editor.value?.chain().focus().insertContent({
    type: 'mermaid',
    attrs: { code }
  }).run()
}

function openImagePicker() {
  mediaPickerOpen.value = true
}

function uploadImagesFromList(fileList: FileList | undefined | null) {
  const files = [...(fileList ?? [])].filter((file) => file.type.startsWith('image/'))

  if (!files.length) {
    return false
  }

  files.forEach((file) => {
    void uploadImage(file)
  })
  return true
}

async function uploadImage(file: File) {
  uploading.value = true

  try {
    const formData = new FormData()
    formData.append('file', file)
    const asset = await $fetch<{ url: string }>('/api/admin/upload', {
      method: 'POST',
      body: formData
    })

    if (asset.url) {
      editor.value?.chain().focus().setImage({ src: asset.url, alt: file.name }).run()
    }
  } finally {
    uploading.value = false
  }
}

function handleMediaPicked(files: MediaRecord[]) {
  for (const file of files) {
    editor.value?.chain().focus().setImage({ src: file.url, alt: file.original_name }).run()
  }
}

async function fetchWikiSuggestions(query: string) {
  if (!query.trim()) {
    wikiSuggestions.value = []
    return
  }

  const response = await $fetch<{ items: WikiSuggestion[] }>('/api/admin/concepts/search', {
    query: { q: query }
  }).catch(() => ({ items: [] }))

  wikiSuggestions.value = response.items
  showWikiSuggestions.value = true
}

function insertWikiLinkFromQuery() {
  if (!wikiQuery.value.trim()) {
    return
  }

  insertWikiLink(wikiQuery.value.trim())
}

function insertWikiLink(label: string, target = normalizeWikiTarget(label)) {
  if (!target) {
    return
  }

  editor.value?.chain().focus().insertContent({
    type: 'wikiLink',
    attrs: {
      target,
      label
    }
  }).insertContent(' ').run()
  wikiQuery.value = ''
  wikiSuggestions.value = []
  showWikiSuggestions.value = false
}
</script>