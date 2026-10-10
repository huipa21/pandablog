<template>
  <!--
    WYSIWYG contract: this frontend renderer mirrors components/admin/editor/QuoteBlockNodeView.vue
    exactly — same DOM, same class names, same CSS. Only editor-only chrome (NodeViewWrapper, drag
    handles, contenteditable bodies) is omitted. Do not introduce divergent class names here.
  -->
  <div class="quote-nodeview" :data-style="quoteStyle">
    <div class="quote-block">
      <!-- Vertical bar style (default) -->
      <div v-if="quoteStyle === 'bar'" class="quote-bar-row">
        <div class="quote-bar" />
        <div class="quote-bar-content">
          <div class="quote-body">
            <ContentRenderer v-for="(child, i) in node.content ?? []" :key="i" :node="child" />
          </div>
          <div v-if="authorName" class="quote-source">
            <span class="quote-author">{{ authorName }}</span>
            <span v-if="authorTitle" class="quote-title">{{ authorTitle }}</span>
          </div>
        </div>
      </div>

      <!-- Quotation marks style -->
      <div v-else class="quote-marks-row">
        <div class="quote-top-row" aria-hidden="true">
          <span class="quote-mark quote-mark-open">"</span>
          <span class="quote-rule" />
        </div>

        <div class="quote-body">
          <ContentRenderer v-for="(child, i) in node.content ?? []" :key="i" :node="child" />
        </div>

        <div class="quote-bottom-row">
          <div v-if="authorName" class="quote-source-marks">
            <span class="quote-author-name">— {{ authorName }}<span v-if="authorTitle">,</span></span>
            <span v-if="authorTitle" class="quote-author-title">{{ authorTitle }}</span>
          </div>
          <span class="quote-mark quote-mark-close">"</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'
import ContentRenderer from './ContentRenderer.vue'
import { QUOTE_STYLES } from '~/extensions/blockquoteEnhanced'
import '~/assets/css/block-presentation.css'

const props = defineProps<{
  node: JsonContent
}>()

const supportedStyles = new Set(QUOTE_STYLES.map((s) => s.value as string))

// Legacy theme name → hex fallback (for posts saved before hex colour support)
const quoteStyle = computed(() => {
  const v = String(props.node.attrs?.style ?? 'bar')
  return supportedStyles.has(v) ? v : 'bar'
})
const authorName = computed(() => String(props.node.attrs?.authorName ?? ''))
const authorTitle = computed(() => String(props.node.attrs?.authorTitle ?? ''))

</script>

<style src="~/assets/css/quote-block.css" />
