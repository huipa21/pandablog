<template>
  <section class="footnotes-block" data-footnotes-block="true">
    <ol v-if="items.length" class="footnotes-block-list">
      <li
        v-for="(item, index) in items"
        :id="footnoteItemId(item, index)"
        :key="footnoteRawId(item, index)"
        class="footnotes-block-item"
        :data-footnote-id="footnoteRawId(item, index)"
      >
        <a
          class="footnote-backref"
          :href="`#${footnoteReferenceId(item, index)}`"
          :aria-label="`Back to footnote reference ${index + 1}`"
        ></a>
        <ContentRenderer v-for="(child, childIndex) in item.content ?? []" :key="childIndex" :node="child" />
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'

const props = defineProps<{
  node: JsonContent
}>()

const orderedList = computed(() => props.node.content?.find((child) => child.type === 'orderedList'))
const items = computed(() => orderedList.value?.content?.filter((child) => child.type === 'listItem') ?? [])

function footnoteRawId(item: JsonContent, index: number) {
  const value = item.attrs?.footnoteId
  return typeof value === 'string' && value.trim() ? value.trim() : String(index + 1)
}

function footnoteItemId(item: JsonContent, index: number) {
  return `fn-${footnoteRawId(item, index)}`
}

function footnoteReferenceId(item: JsonContent, index: number) {
  return `fnref-${footnoteRawId(item, index)}`
}
</script>