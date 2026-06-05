<template>
  <div
    :class="['codeblock-nodeview', 'codeblock-wrap', `code-theme-${theme}`]"
    :data-theme="theme"
    :data-language="language"
    :data-line-highlights="lineHighlights"
    :data-wrap="wrapLines ? 'true' : 'false'"
    :data-zoom="zoom"
    :style="{ '--pb-code-zoom': String(zoom) }"
  >
    <div
      class="codeblock-header"
    >
      <div class="codeblock-header-left">
        <button
          type="button"
          class="codeblock-action"
          :title="collapsed ? 'Expand code' : 'Collapse code'"
          @click="toggleCollapsed"
        >
          <UIcon :name="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="size-3" />
        </button>
        <UIcon :name="fileIcon" class="size-3.5 shrink-0" />
        <span v-if="fileName" class="truncate font-medium">{{ fileName }}</span>
        <span v-else class="truncate opacity-60">untitled</span>
        <span v-if="showTotalLines" class="opacity-50">·</span>
        <span v-if="showTotalLines" class="opacity-70">{{ lineCount }} {{ lineCount === 1 ? 'line' : 'lines' }}</span>
      </div>
      <div class="codeblock-header-right">
        <button
          type="button"
          class="codeblock-action"
          title="Zoom out"
          @click="adjustZoom(-0.1)"
        >
          <UIcon name="i-lucide-minus" class="size-3" />
        </button>
        <span class="codeblock-zoom">{{ Math.round(zoom * 100) }}%</span>
        <button
          type="button"
          class="codeblock-action"
          title="Zoom in"
          @click="adjustZoom(0.1)"
        >
          <UIcon name="i-lucide-plus" class="size-3" />
        </button>
        <button
          type="button"
          class="codeblock-action"
          :class="wrapLines ? 'is-active' : ''"
          :aria-pressed="wrapLines ? 'true' : 'false'"
          :title="wrapLines ? 'Wrap: on' : 'Wrap: off'"
          @click="toggleWrap"
        >
          <UIcon name="i-lucide-wrap-text" class="size-3" />
          <span>{{ wrapLines ? 'Wrapped' : 'No wrap' }}</span>
        </button>
        <span class="codeblock-lang-pill">{{ languageLabel }}</span>
        <button
          type="button"
          class="codeblock-copy"
          :title="copied ? 'Copied!' : 'Copy code'"
          @click="copy"
        >
          <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3" />
          <span>{{ copied ? 'Copied' : 'Copy' }}</span>
        </button>
      </div>
    </div>
    <div
      ref="bodyEl"
      class="codeblock-body-wrap"
      :class="{ 'is-collapsed': collapsible && collapsed }"
      :style="bodyStyle"
    >
      <div :class="['codeblock-body', lineNumbers ? 'with-line-numbers' : '', wrapLines ? 'is-wrapped' : '']" v-html="highlightedHtml || fallbackHtml" />
      <div v-if="collapsed && collapsible" class="codeblock-fade" />
    </div>
    <div v-if="collapsible" class="codeblock-tail">
      <button type="button" class="codeblock-tail-btn" @click="toggleCollapsed">
        {{ collapsed ? 'Show more' : 'Show less' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'
import { CODE_BLOCK_LANGUAGES, CODE_BLOCK_THEMES, DEFAULT_CODE_THEME, normalizeCodeLineHighlights, parseCodeLineHighlights } from '~/extensions/codeBlockEnhanced'
import { all, createLowlight } from 'lowlight'

const htmlCache = new Map<string, string>()
const COLLAPSE_THRESHOLD = 300
const lowlight = createLowlight(all)

const props = defineProps<{
  node: JsonContent
}>()

const languageLabelMap = new Map<string, string>(CODE_BLOCK_LANGUAGES.map((item) => [item.value as string, item.label]))
const supportedLanguages = new Set<string>(CODE_BLOCK_LANGUAGES.map((item) => item.value as string))
const supportedThemes = new Set<string>(CODE_BLOCK_THEMES.map((item) => item.value as string))

const code = computed(() => textContent(props.node))
const language = computed(() => {
  const value = typeof props.node.attrs?.language === 'string' ? props.node.attrs.language : 'text'
  return supportedLanguages.has(value) ? value : 'text'
})
const theme = computed(() => {
  const value = typeof props.node.attrs?.theme === 'string' ? props.node.attrs.theme : DEFAULT_CODE_THEME
  return supportedThemes.has(value) ? value : DEFAULT_CODE_THEME
})
const lineNumbers = computed(() => props.node.attrs?.lineNumbers !== false)
const lineHighlights = computed(() => normalizeCodeLineHighlights(props.node.attrs?.lineHighlights))
const highlightedLineSet = computed(() => parseCodeLineHighlights(lineHighlights.value))
const fileName = computed(() => typeof props.node.attrs?.fileName === 'string' ? props.node.attrs.fileName : '')
const showTotalLines = computed(() => props.node.attrs?.showTotalLines === true)
const languageLabel = computed(() => languageLabelMap.get(language.value) ?? language.value)
const lineCount = computed(() => Math.max((code.value ?? '').split('\n').length, 1))
const wrapLines = ref(props.node.attrs?.wrap !== false)
const zoom = ref(clampZoom(props.node.attrs?.zoom))

const copied = ref(false)
const initialCacheKey = `${theme.value}\u0000${language.value}\u0000${lineNumbers.value ? '1' : '0'}\u0000${lineHighlights.value}\u0000${code.value}`
const initialRendered = renderLowlightHtml(code.value, language.value)
htmlCache.set(initialCacheKey, initialRendered)
const highlightedHtml = ref(initialRendered)
const fallbackHtml = computed(() => `<pre class="codeblock-pre hljs"><code>${escapeHtml(code.value)}</code></pre>`)

// Collapse state
const bodyEl = ref<HTMLElement | null>(null)
const naturalHeight = ref(0)
const collapsed = ref(props.node.attrs?.collapsed !== false)
const collapsible = computed(() => naturalHeight.value > COLLAPSE_THRESHOLD)
const bodyStyle = computed(() => {
  if (!collapsible.value) return {}
  return collapsed.value ? { maxHeight: `${COLLAPSE_THRESHOLD}px` } : {}
})

const fileIcon = computed(() => {
  const ext = (fileName.value.split('.').pop() ?? language.value).toLowerCase()
  const map: Record<string, string> = {
    ts: 'i-vscode-icons-file-type-typescript',
    tsx: 'i-vscode-icons-file-type-typescript',
    js: 'i-vscode-icons-file-type-js',
    jsx: 'i-vscode-icons-file-type-js',
    vue: 'i-vscode-icons-file-type-vue',
    html: 'i-vscode-icons-file-type-html',
    css: 'i-vscode-icons-file-type-css',
    json: 'i-vscode-icons-file-type-json',
    md: 'i-vscode-icons-file-type-markdown',
    markdown: 'i-vscode-icons-file-type-markdown',
    py: 'i-vscode-icons-file-type-python',
    python: 'i-vscode-icons-file-type-python',
    rs: 'i-vscode-icons-file-type-rust',
    rust: 'i-vscode-icons-file-type-rust',
    go: 'i-vscode-icons-file-type-go-gopher'
  }
  return map[ext] ?? 'i-lucide-file-code-2'
})

async function renderCode() {
  const cacheKey = `${theme.value}\u0000${language.value}\u0000${lineNumbers.value ? '1' : '0'}\u0000${lineHighlights.value}\u0000${code.value}`
  const cached = htmlCache.get(cacheKey)
  if (cached) {
    // Only update the DOM if the cached HTML differs from what's already rendered.
    if (highlightedHtml.value !== cached) {
      highlightedHtml.value = cached
    }
    await nextTick()
    measure()
    return
  }

  const rendered = renderLowlightHtml(code.value, language.value)

  htmlCache.set(cacheKey, rendered)
  highlightedHtml.value = rendered
  await nextTick()
  measure()
}

function measure() {
  if (!bodyEl.value) return
  // Temporarily remove constraint to get natural height
  const prevMax = bodyEl.value.style.maxHeight
  bodyEl.value.style.maxHeight = 'none'
  naturalHeight.value = bodyEl.value.scrollHeight
  bodyEl.value.style.maxHeight = prevMax
}

onMounted(async () => {
  // Don't re-render the highlighted HTML on mount if we already have server-rendered HTML.
  // Just measure the rendered content to compute collapsing behavior.
  await nextTick()
  measure()
})
watch([code, language, theme, lineHighlights, lineNumbers], () => { void renderCode() })

async function copy() {
  try {
    await navigator.clipboard.writeText(code.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    // ignore
  }
}

function clampZoom(value: unknown) {
  const numeric = Number(value ?? 1)
  if (!Number.isFinite(numeric)) {
    return 1
  }
  return Math.max(0.7, Math.min(2, numeric))
}

function adjustZoom(delta: number) {
  zoom.value = Math.round(Math.max(0.7, Math.min(2, zoom.value + delta)) * 100) / 100
}

function toggleWrap() {
  wrapLines.value = !wrapLines.value
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value
}

function renderLowlightHtml(source: string, lang: string) {
  const normalizedLang = lowlight.registered(lang) ? lang : 'plaintext'

  try {
    const tree = lowlight.highlight(normalizedLang, source)
    const highlightedLines = serializeNodesToLines((tree.children ?? []) as HighlightNode[])
    const lines = highlightedLines
      .map((line, index) => {
        const safeLine = line || ' '
        const lineNumber = index + 1
        const highlightedClass = highlightedLineSet.value.has(lineNumber) ? ' is-highlighted' : ''
        if (!lineNumbers.value) {
          return `<span class="line${highlightedClass}">${safeLine}</span>`
        }

        return `<span class="line line-numbered${highlightedClass}"><span class="ln">${lineNumber}</span><span class="lc">${safeLine}</span></span>`
      })
      .join('')

    return `<pre class="hljs"><code class="language-${escapeAttr(normalizedLang)}">${lines}</code></pre>`
  } catch {
    return fallbackHtml.value
  }
}

type HighlightNode = {
  type: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HighlightNode[]
}

type HtmlFrame = {
  tagName: string
  attrs: string
}

function serializeNodesToLines(nodes: HighlightNode[]) {
  const lines: string[] = ['']

  const append = (value: string) => {
    lines[lines.length - 1] += value
  }

  const openFrames = (frames: HtmlFrame[]) => frames.map((frame) => `<${frame.tagName}${frame.attrs}>`).join('')
  const closeFrames = (frames: HtmlFrame[]) => frames.slice().reverse().map((frame) => `</${frame.tagName}>`).join('')

  const splitLine = (frames: HtmlFrame[]) => {
    append(closeFrames(frames))
    lines.push('')
    append(openFrames(frames))
  }

  const visit = (node: HighlightNode, frames: HtmlFrame[]) => {
    if (node.type === 'text') {
      const segments = (node.value ?? '').split('\n')
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index] ?? ''
        if (segment) {
          append(escapeHtml(segment))
        }
        if (index < segments.length - 1) {
          splitLine(frames)
        }
      }
      return
    }

    if (node.type !== 'element' || !node.tagName) {
      return
    }

    const frame: HtmlFrame = {
      tagName: node.tagName,
      attrs: serializeAttributes(node.properties ?? {})
    }

    append(`<${frame.tagName}${frame.attrs}>`)
    const nextFrames = [...frames, frame]
    for (const child of node.children ?? []) {
      visit(child, nextFrames)
    }
    append(`</${frame.tagName}>`)
  }

  for (const node of nodes) {
    visit(node, [])
  }

  return lines
}

function serializeAttributes(properties: Record<string, unknown>) {
  const attrs: string[] = []

  for (const [name, value] of Object.entries(properties)) {
    const attrName = name === 'className' ? 'class' : name

    if (value === undefined || value === null || value === false) {
      continue
    }

    if (Array.isArray(value)) {
      attrs.push(`${attrName}="${escapeAttr(value.map(String).join(' '))}"`)
      continue
    }

    if (value === true) {
      attrs.push(attrName)
      continue
    }

    attrs.push(`${attrName}="${escapeAttr(String(value))}"`)
  }

  return attrs.length ? ` ${attrs.join(' ')}` : ''
}

function textContent(node: JsonContent): string {
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'text') return node.text ?? ''

  const children = node.content ?? []
  return children.map((child, index) => {
    const next = textContent(child)
    const needsBlockBreak = child.type === 'paragraph' && index < children.length - 1
    return needsBlockBreak ? `${next}\n` : next
  }).join('')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/'/g, '&#39;')
}
</script>

<style>
@import '~/assets/css/code-themes.css';

.codeblock-wrap {
  /* Slightly smaller font and explicit line-height to match VS Code rhythm */
  --code-font-size: var(--pb-code-font-size);
  --code-line-height: var(--pb-code-line-height);
  --code-block-padding-y: var(--pb-code-block-padding-y);
  --code-line-number-gutter-width: var(--pb-code-line-number-gutter-width);
  --pb-code-zoom: 1;
  margin: 1.5rem 0;
  border-radius: 0.5rem;
  overflow: hidden;
  background: var(--code-bg, #1e1e1e);
  color: var(--code-fg, #d4d4d4);
  border: 0 !important;
  box-shadow: none;
}

.codeblock-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  font-size: 0.75rem;
  line-height: 1.25rem;
  background: rgba(255, 255, 255, 0.04);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: inherit;
  opacity: 0.95;
  text-transform: none;
  letter-spacing: normal;
}

.codeblock-wrap[data-theme="github-light"] .codeblock-header,
.codeblock-wrap[data-theme="vs-light"] .codeblock-header,
.codeblock-wrap[data-theme="solarized-light"] .codeblock-header {
  background: rgba(0, 0, 0, 0.04);
}

.codeblock-header-left,
.codeblock-header-right {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.codeblock-header-left {
  font-weight: 500;
}

.codeblock-header-right {
  gap: 0.5rem;
  flex-shrink: 0;
}

.codeblock-action {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  border: 1px solid rgba(127, 127, 127, 0.28);
  background: transparent;
  color: inherit;
  opacity: 0.85;
  border-radius: 0.3rem;
  padding: 0.1rem 0.35rem;
  font-size: 0.68rem;
  line-height: 1;
}

.codeblock-action:hover {
  opacity: 1;
  border-color: rgba(127, 127, 127, 0.44);
}

.codeblock-action.is-active {
  background: rgba(127, 127, 127, 0.2);
  opacity: 1;
}

.codeblock-zoom {
  font-size: 0.68rem;
  opacity: 0.8;
  min-width: 2.2rem;
  text-align: center;
}

.codeblock-lang-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.05rem 0.5rem;
  border-radius: 999px;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(127, 127, 127, 0.18);
  color: inherit;
  opacity: 0.85;
}

.codeblock-copy {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1rem 0.35rem;
  border-radius: 0.3rem;
  background: transparent;
  color: inherit;
  opacity: 0.85;
  border: 1px solid rgba(127, 127, 127, 0.28);
  cursor: pointer;
  font-size: 0.68rem;
  line-height: 1;
}

.codeblock-copy:hover {
  opacity: 1;
  border-color: rgba(127, 127, 127, 0.44);
}

.codeblock-body-wrap {
  position: relative;
  overflow: hidden;
  transition: max-height 0.25s ease;
}

.codeblock-body-wrap.is-collapsed {
  overflow: hidden;
}

.codeblock-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 80px;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent, var(--code-bg, #1e1e1e));
}

.codeblock-body pre {
  margin: 0;
  padding: var(--code-block-padding-y) 1rem;
  overflow-x: auto;
  font-size: calc(var(--code-font-size) * var(--pb-code-zoom));
  line-height: calc(var(--code-line-height) * var(--pb-code-zoom));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
  background: transparent !important;
  color: inherit;
  border: 0 !important;
  box-shadow: none !important;
  outline: 0 !important;
}

.codeblock-body pre code,
.codeblock-body pre code * {
  line-height: calc(var(--code-line-height) * var(--pb-code-zoom));
  font-size: calc(var(--code-font-size) * var(--pb-code-zoom));
  border: 0 !important;
  box-shadow: none !important;
  outline: 0 !important;
}

.codeblock-body pre code {
  white-space: pre;
  overflow-wrap: normal;
  word-break: normal;
}

.codeblock-body.is-wrapped pre code {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.codeblock-body .hljs,
.codeblock-body .hljs code,
.codeblock-body .line {
  background: transparent !important;
  color: inherit;
}

.codeblock-body .line {
  display: block;
  width: 100%;
  min-height: var(--code-line-height);
  line-height: var(--code-line-height);
  font-size: var(--code-font-size);
}

.codeblock-body .line.is-highlighted {
  background: rgba(250, 204, 21, 0.16) !important;
}

.codeblock-body.with-line-numbers .line.line-numbered.is-highlighted .ln {
  color: rgba(250, 204, 21, 0.95);
  background: rgba(250, 204, 21, 0.12);
}

.codeblock-body.with-line-numbers pre code {
  counter-reset: code-line;
  display: block;
}

.codeblock-body.with-line-numbers .line.line-numbered {
  display: grid;
  grid-template-columns: var(--code-line-number-gutter-width) minmax(0, 1fr);
  align-items: start;
}

.codeblock-body.with-line-numbers .line.line-numbered .ln {
  display: inline-block;
  height: var(--code-line-height);
  line-height: var(--code-line-height);
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  text-align: right;
  color: rgba(127, 127, 127, 0.6);
  font-size: var(--code-font-size);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.codeblock-body.with-line-numbers .line.line-numbered .lc {
  min-width: 0;
  white-space: pre;
  overflow-wrap: normal;
  word-break: normal;
}

.codeblock-body.is-wrapped.with-line-numbers .line.line-numbered .lc {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.codeblock-body.with-line-numbers .line:not(:has(.ln)) {
  display: block;
  width: 100%;
  padding-left: var(--code-line-number-gutter-width);
  position: relative;
  min-height: var(--code-line-height);
  line-height: var(--code-line-height);
  font-size: var(--code-font-size);
}

.codeblock-body.with-line-numbers .line:not(:has(.ln))::before {
  counter-increment: code-line;
  content: counter(code-line);
  position: absolute;
  left: 0;
  top: 0;
  width: var(--code-line-number-gutter-width);
  height: var(--code-line-height);
  line-height: var(--code-line-height);
  text-align: right;
  color: rgba(127, 127, 127, 0.6);
  user-select: none;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  display: inline-block;
  font-size: var(--code-font-size);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
  font-variant-numeric: tabular-nums;
}

/* When server-rendered HTML includes explicit .ln nodes, disable pseudo-counter numbers. */
.codeblock-body.with-line-numbers .line:has(.ln)::before {
  content: none;
  counter-increment: none;
  display: none;
}

.codeblock-body.with-line-numbers .line:has(.ln) {
  padding-left: 0;
  position: static;
}

.codeblock-tail {
  display: flex;
  justify-content: center;
  padding: 0 0 0.5rem;
}

.codeblock-tail-btn {
  border: 0;
  background: transparent;
  color: rgba(230, 237, 243, 0.75);
  font-size: 0.72rem;
  letter-spacing: 0.01em;
  padding: 0.1rem 0.4rem;
  cursor: pointer;
}

.codeblock-tail-btn:hover {
  color: rgba(230, 237, 243, 0.95);
}
</style>
