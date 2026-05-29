<template>
  <NodeViewWrapper
    class="quote-nodeview my-6"
    :data-style="quoteStyle"
    :data-theme="theme"
    :data-font-family="fontFamily"
    data-node-view-wrapper
  >
    <div class="quote-block" :style="blockStyle">
      <!-- Vertical bar style (default) -->
      <div v-if="quoteStyle === 'bar'" class="quote-bar-row">
        <div class="quote-bar" :style="{ backgroundColor: theme || '#0f766e' }" />
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
          <span class="quote-mark quote-mark-open" :style="{ color: theme }">"</span>
          <span class="quote-rule" :style="{ backgroundColor: theme }" />
        </div>

        <NodeViewContent as="div" class="quote-body" />

        <div class="quote-bottom-row" contenteditable="false">
          <div v-if="authorName" class="quote-source-marks">
            <span class="quote-author-name">— {{ authorName }}<span v-if="authorTitle">,</span></span>
            <span v-if="authorTitle" class="quote-author-title">{{ authorTitle }}</span>
          </div>
          <span class="quote-mark quote-mark-close" :style="{ color: theme }">"</span>
        </div>
      </div>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { QUOTE_STYLES } from '~/extensions/blockquoteEnhanced'

const props = defineProps(nodeViewProps)

const supportedStyles = new Set(QUOTE_STYLES.map((s) => s.value as string))

// Legacy theme name → hex fallback (for posts saved before hex colour support)
const LEGACY_THEME_MAP: Record<string, string> = {
  amber: '#f59e0b',
  teal: '#0f766e',
  blue: '#1d4ed8',
  rose: '#be123c',
  violet: '#7c3aed',
  slate: '#475569',
}

const quoteStyle = computed(() => {
  const v = String(props.node.attrs.style ?? 'bar')
  return supportedStyles.has(v) ? v : 'bar'
})
const theme = computed(() => {
  const v = String(props.node.attrs.theme ?? '#0f766e')
  return LEGACY_THEME_MAP[v] ?? v
})
const fontFamily = computed(() => String(props.node.attrs.fontFamily ?? 'sans'))
const fontSize = computed(() => String(props.node.attrs.fontSize ?? '1rem'))
const fontColor = computed(() => String(props.node.attrs.fontColor ?? '#1c1917'))
const backgroundColor = computed(() => String(props.node.attrs.backgroundColor ?? ''))
const authorName = computed(() => String(props.node.attrs.authorName ?? ''))
const authorTitle = computed(() => String(props.node.attrs.authorTitle ?? ''))

const blockStyle = computed(() => {
  const fontFamilyMap: Record<string, string> = {
    sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    serif: 'ui-serif, Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace'
  }
  
  return {
    '--quote-accent': theme.value,
    '--quote-font-family': fontFamilyMap[fontFamily.value] || fontFamilyMap.sans,
    '--quote-font-size': fontSize.value,
    '--quote-font-color': fontColor.value,
    '--quote-bg-color': backgroundColor.value
  }
})
</script>

<style scoped>
.quote-block {
  --quote-accent: #0f766e;
  --quote-font-family: ui-sans-serif, system-ui, -apple-system;
  --quote-font-size: 1rem;
  --quote-font-color: #1c1917;
  --quote-bg-color: transparent;
  
  font-family: var(--quote-font-family);
  font-size: var(--quote-font-size);
  color: var(--quote-font-color);
  background-color: var(--quote-bg-color);
}

/* Vertical bar style */
.quote-bar-row {
  display: flex;
  gap: 1rem;
  padding: 0.75rem;
}

.quote-bar {
  width: 4px;
  background-color: var(--quote-accent);
  border-radius: 1px;
  flex-shrink: 0;
}

.quote-bar-content {
  flex: 1;
  min-width: 0;
}

.quote-bar-content .quote-body {
  font-style: italic;
  line-height: 1.6;
  min-height: 1.5em;
}

.quote-marks-row .quote-body {
  line-height: 1.6;
  min-height: 1.5em;
}

.quote-source {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  font-style: normal;
  opacity: 0.7;
}

.quote-author {
  font-weight: 600;
}

.quote-title {
  margin-left: 0.25rem;
}

/* Quotation marks style */
.quote-marks-row {
  padding: 0.5rem 0;
}

.quote-top-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.quote-mark {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 3.5rem;
  line-height: 1;
  user-select: none;
  flex-shrink: 0;
}

.quote-mark-open {
  margin-top: -0.5rem;
}

.quote-rule {
  flex: 1;
  height: 1px;
  opacity: 0.4;
}

.quote-bottom-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: 1rem;
  gap: 1rem;
}

.quote-source-marks {
  font-size: 0.875rem;
  font-style: normal;
}

.quote-author-name {
  font-weight: 600;
}

.quote-author-title {
  margin-left: 0.25rem;
  font-style: italic;
  opacity: 0.7;
}

.quote-mark-close {
  margin-bottom: -0.75rem;
  align-self: flex-end;
}
</style>

