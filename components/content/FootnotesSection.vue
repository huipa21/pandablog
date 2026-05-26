<template>
  <footer v-if="footnotes.length > 0" class="footnotes mt-12 border-t border-stone-200 pt-6">
    <h2 class="mb-4 text-lg font-semibold text-stone-800">Footnotes</h2>
    <ol class="list-decimal space-y-2 pl-6 text-sm text-stone-700">
      <li v-for="fn in footnotes" :key="fn.id" :id="`fn-${fn.id}`">
        {{ fn.content }}
        <a :href="`#fnref-${fn.id}`" class="ml-1 text-teal-600 hover:text-teal-800">↩</a>
      </li>
    </ol>
  </footer>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'

const props = defineProps<{
  content: JsonContent
}>()

interface FootnoteEntry {
  id: string
  index: number
  content: string
}

const footnotes = computed(() => {
  const refs = collectFootnoteRefs(props.content)
  const notes = extractFootnoteNotes(props.content)

  return refs.map((ref, idx) => ({
    ...ref,
    content: notes[idx] ?? ''
  }))
})

function collectFootnoteRefs(node: JsonContent) {
  const refs: FootnoteEntry[] = []
  const seen = new Set<string>()

  walkContent(node, (mark) => {
    const id = String(mark.attrs?.id ?? '')
    if (!id || seen.has(id)) return

    seen.add(id)
    refs.push({
      id,
      index: Number(mark.attrs?.index ?? refs.length + 1),
      content: ''
    })
  })

  refs.sort((a, b) => a.index - b.index)
  return refs
}

function walkContent(node: JsonContent, onFootnote: (mark: { type: string, attrs?: Record<string, unknown> }) => void) {
  if (node.marks) {
    for (const mark of node.marks) {
      if (mark.type === 'footnote') {
        onFootnote(mark)
      }
    }
  }
  if (node.content) {
    for (const child of node.content) {
      walkContent(child, onFootnote)
    }
  }
}

function extractFootnoteNotes(doc: JsonContent) {
  const children = doc.content ?? []
  if (children.length < 2) return []

  for (let i = children.length - 1; i >= 1; i -= 1) {
    const orderedList = children[i]
    const heading = children[i - 1]
    if (!heading || !orderedList) continue
    if (heading.type !== 'paragraph' || orderedList.type !== 'orderedList') continue
    if (flattenNodeText(heading).trim().toLowerCase() !== 'footnotes') continue
    return (orderedList.content ?? []).map((item) => flattenNodeText(item).trim())
  }

  return []
}

function flattenNodeText(node: JsonContent): string {
  if (node.type === 'text') {
    return node.text ?? ''
  }

  return node.content?.map(flattenNodeText).join(' ') ?? ''
}
</script>
