<template>
  <NodeViewWrapper
    class="quote-nodeview"
    :data-style="quoteStyle"
    data-node-view-wrapper
  >
    <div class="quote-block">
      <!-- Vertical bar style (default) -->
      <div v-if="quoteStyle === 'bar'" class="quote-bar-row">
        <div class="quote-bar" />
        <div class="quote-bar-content">
          <NodeViewContent as="div" class="quote-body quote-body-editable" />
          <div v-if="authorName" class="quote-source">
            <span class="quote-author">{{ authorName }}</span>
            <span v-if="authorTitle" class="quote-title">{{ authorTitle }}</span>
          </div>
        </div>
      </div>

      <!-- Quotation marks style -->
      <div v-else class="quote-marks-row">
        <div class="quote-top-row" contenteditable="false">
          <span class="quote-mark quote-mark-open">"</span>
          <span class="quote-rule" />
        </div>

        <NodeViewContent as="div" class="quote-body" />

        <div class="quote-bottom-row" contenteditable="false">
          <div v-if="authorName" class="quote-source-marks">
            <span class="quote-author-name">— {{ authorName }}<span v-if="authorTitle">,</span></span>
            <span v-if="authorTitle" class="quote-author-title">{{ authorTitle }}</span>
          </div>
          <span class="quote-mark quote-mark-close">"</span>
        </div>
      </div>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { QUOTE_STYLES } from '~/extensions/blockquoteEnhanced'
import '~/assets/css/block-presentation.css'

const props = defineProps(nodeViewProps)

const supportedStyles = new Set(QUOTE_STYLES.map((s) => s.value as string))

// Legacy theme name → hex fallback (for posts saved before hex colour support)
const quoteStyle = computed(() => {
  const v = String(props.node.attrs.style ?? 'bar')
  return supportedStyles.has(v) ? v : 'bar'
})
const authorName = computed(() => String(props.node.attrs.authorName ?? ''))
const authorTitle = computed(() => String(props.node.attrs.authorTitle ?? ''))

</script>

<style src="~/assets/css/quote-block.css" />

