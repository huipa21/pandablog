<template>
  <div v-if="quoteStyle === 'bar'" class="pull-quote pull-quote-bar" :data-style="quoteStyle" :style="blockStyle">
    <div class="pull-quote-bar-row">
      <div class="pull-quote-bar-stripe" />
      <div class="pull-quote-bar-content">
        <div class="pull-quote-body">
          <ContentRenderer v-for="(child, i) in node.content ?? []" :key="i" :node="child" />
        </div>
        <div v-if="authorName" class="pull-quote-source">
          <span class="pull-quote-author">{{ authorName }}</span>
          <span v-if="authorTitle" class="pull-quote-title">{{ authorTitle }}</span>
        </div>
      </div>
    </div>
  </div>

  <blockquote v-else class="pull-quote pull-quote-marks" :data-style="quoteStyle" :style="blockStyle">
    <!-- Top decoration: large open quote + horizontal rule -->
    <div class="pull-quote-top-row" aria-hidden="true">
      <span class="pull-quote-mark pull-quote-mark-open">"</span>
      <span class="pull-quote-rule" />
    </div>

    <!-- Quote body content -->
    <div class="pull-quote-body">
      <ContentRenderer v-for="(child, i) in node.content ?? []" :key="i" :node="child" />
    </div>

    <!-- Author row -->
    <div v-if="authorName" class="pull-quote-bottom-row">
      <div class="pull-quote-source-marks">
        <span class="pull-quote-author-name">— {{ authorName }}<span v-if="authorTitle">,</span></span>
        <span v-if="authorTitle" class="pull-quote-author-title">{{ authorTitle }}</span>
      </div>
      <span class="pull-quote-mark pull-quote-mark-close" aria-hidden="true">"</span>
    </div>
    <div v-else class="pull-quote-bottom-row">
      <span class="pull-quote-mark pull-quote-mark-close" aria-hidden="true">"</span>
    </div>
  </blockquote>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'
import ContentRenderer from './ContentRenderer.vue'
import { QUOTE_STYLES } from '~/extensions/blockquoteEnhanced'

const props = defineProps<{
  node: JsonContent
}>()

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
  const v = String(props.node.attrs?.style ?? 'bar')
  return supportedStyles.has(v) ? v : 'bar'
})
const theme = computed(() => {
  const v = String(props.node.attrs?.theme ?? '#0f766e')
  return LEGACY_THEME_MAP[v] ?? v
})
const fontFamily = computed(() => String(props.node.attrs?.fontFamily ?? 'sans'))
const fontSize = computed(() => String(props.node.attrs?.fontSize ?? '1rem'))
const fontColor = computed(() => String(props.node.attrs?.fontColor ?? '#1c1917'))
const backgroundColor = computed(() => String(props.node.attrs?.backgroundColor ?? ''))
const authorName = computed(() => String(props.node.attrs?.authorName ?? ''))
const authorTitle = computed(() => String(props.node.attrs?.authorTitle ?? ''))

const blockStyle = computed(() => {
  const fontFamilyMap: Record<string, string> = {
    sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    serif: 'ui-serif, Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace'
  }
  
  return {
    '--pull-quote-accent': theme.value,
    '--pull-quote-font-family': fontFamilyMap[fontFamily.value] || fontFamilyMap.sans,
    '--pull-quote-font-size': fontSize.value,
    '--pull-quote-font-color': fontColor.value,
    '--pull-quote-bg-color': backgroundColor.value
  }
})
</script>

