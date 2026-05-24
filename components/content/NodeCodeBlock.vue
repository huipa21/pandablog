<template>
  <div
    :class="['codeblock-public-wrap', `code-theme-${theme}`]"
    :data-theme="theme"
    :data-language="language"
  >
    <div class="codeblock-public-header">
      <div class="codeblock-public-header-left">
        <UIcon :name="fileIcon" class="size-3.5 shrink-0" />
        <span v-if="fileName" class="truncate font-medium">{{ fileName }}</span>
        <span v-else class="truncate opacity-60">untitled</span>
        <span v-if="showTotalLines" class="opacity-50">·</span>
        <span v-if="showTotalLines" class="opacity-70">{{ lineCount }} {{ lineCount === 1 ? 'line' : 'lines' }}</span>
      </div>
      <div class="codeblock-public-header-right">
        <span class="codeblock-lang-pill">{{ languageLabel }}</span>
        <button type="button" class="codeblock-public-copy" :title="copied ? 'Copied!' : 'Copy code'" @click="copy">
          <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3" />
          <span>{{ copied ? 'Copied' : 'Copy' }}</span>
        </button>
      </div>
    </div>
    <div
      ref="bodyEl"
      class="codeblock-public-body-wrap"
      :class="{ 'is-collapsed': collapsible && collapsed }"
      :style="bodyStyle"
    >
      <div :class="['codeblock-public-body', lineNumbers ? 'with-line-numbers' : '']" v-html="highlightedHtml || fallbackHtml" />
      <div v-if="collapsible && collapsed" class="codeblock-public-fade" />
    </div>
    <button
      v-if="collapsible"
      type="button"
      class="codeblock-public-toggle"
      @click="collapsed = !collapsed"
    >
      <UIcon :name="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="size-3.5" />
      {{ collapsed ? 'Show more' : 'Show less' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'
import { CODE_BLOCK_LANGUAGES, CODE_BLOCK_THEMES, DEFAULT_CODE_THEME } from '~/extensions/codeBlockEnhanced'
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
const fileName = computed(() => typeof props.node.attrs?.fileName === 'string' ? props.node.attrs.fileName : '')
const showTotalLines = computed(() => props.node.attrs?.showTotalLines === true)
const languageLabel = computed(() => languageLabelMap.get(language.value) ?? language.value)
const lineCount = computed(() => Math.max((code.value ?? '').split('\n').length, 1))

const copied = ref(false)
const initialCacheKey = `${theme.value}\u0000${language.value}\u0000${code.value}`
const initialRendered = renderLowlightHtml(code.value, language.value)
htmlCache.set(initialCacheKey, initialRendered)
const highlightedHtml = ref(initialRendered)
const fallbackHtml = computed(() => `<pre class="codeblock-public"><code>${escapeHtml(code.value)}</code></pre>`)

// Collapse state
const bodyEl = ref<HTMLElement | null>(null)
const naturalHeight = ref(0)
const collapsed = ref(false)
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
  const cacheKey = `${theme.value}\u0000${language.value}\u0000${code.value}`
  const cached = htmlCache.get(cacheKey)
  if (cached) {
    highlightedHtml.value = cached
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
  // If small, don't collapse
  if (naturalHeight.value <= COLLAPSE_THRESHOLD) {
    collapsed.value = false
  }
}

onMounted(() => { void renderCode() })
watch([code, language, theme], () => { void renderCode() })

async function copy() {
  try {
    await navigator.clipboard.writeText(code.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    // ignore
  }
}

function renderLowlightHtml(source: string, lang: string) {
  const normalizedLang = lowlight.registered(lang) ? lang : 'plaintext'

  try {
    const tree = lowlight.highlight(normalizedLang, source)
    const inner = serializeNodes(tree.children)
    const lineWrapped = inner
      .split('\n')
      .map((line) => `<span class="line">${line || ' '}</span>`)
      .join('')

    return `<pre class="hljs"><code class="language-${escapeAttr(normalizedLang)}">${lineWrapped}</code></pre>`
  } catch {
    return fallbackHtml.value
  }
}

function serializeNodes(nodes: Array<{ type: string, value?: string, tagName?: string, properties?: Record<string, unknown>, children?: any[] }>) {
  return nodes.map((node) => serializeNode(node)).join('')
}

function serializeNode(node: { type: string, value?: string, tagName?: string, properties?: Record<string, unknown>, children?: any[] }): string {
  if (node.type === 'text') {
    return escapeHtml(node.value ?? '')
  }

  if (node.type !== 'element' || !node.tagName) {
    return ''
  }

  const attrs = serializeAttributes(node.properties ?? {})
  const children = serializeNodes((node.children ?? []) as Array<{ type: string, value?: string, tagName?: string, properties?: Record<string, unknown>, children?: any[] }>)
  return `<${node.tagName}${attrs}>${children}</${node.tagName}>`
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
  if (node.type === 'text') return node.text ?? ''
  return node.content?.map(textContent).join('') ?? ''
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

.codeblock-public-wrap {
  /* Slightly smaller font and explicit line-height to match VS Code rhythm */
  --code-font-size: 0.8125rem; /* 13px */
  --code-line-height: 1.1875rem; /* 19px */
  --code-block-padding-y: 0.125rem; /* 2px */
  margin: 1.5rem 0;
  border-radius: 0.5rem;
  overflow: hidden;
  background: var(--code-bg, #1e1e1e);
  color: var(--code-fg, #d4d4d4);
  border: 1px solid rgba(127, 127, 127, 0.18);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.codeblock-public-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(127, 127, 127, 0.16);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.codeblock-public-wrap[data-theme="github-light"] .codeblock-public-header,
.codeblock-public-wrap[data-theme="vs-light"] .codeblock-public-header,
.codeblock-public-wrap[data-theme="solarized-light"] .codeblock-public-header {
  background: rgba(0, 0, 0, 0.04);
  border-bottom-color: rgba(0, 0, 0, 0.08);
}

.codeblock-public-header-left,
.codeblock-public-header-right {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.codeblock-public-header-right {
  flex-shrink: 0;
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

.codeblock-public-copy {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.5rem;
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  opacity: 0.75;
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 0.7rem;
}

.codeblock-public-copy:hover {
  opacity: 1;
  border-color: rgba(127, 127, 127, 0.3);
}

.codeblock-public-body-wrap {
  position: relative;
  overflow: hidden;
  transition: max-height 0.25s ease;
}

.codeblock-public-body-wrap.is-collapsed {
  overflow: hidden;
}

.codeblock-public-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 80px;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent, var(--code-bg, #1e1e1e));
}

.codeblock-public-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  width: 100%;
  padding: 0.4rem 0.75rem;
  background: rgba(255, 255, 255, 0.04);
  border-top: 1px solid rgba(127, 127, 127, 0.16);
  color: inherit;
  font-size: 0.75rem;
  opacity: 0.85;
  cursor: pointer;
}

.codeblock-public-wrap[data-theme="github-light"] .codeblock-public-toggle,
.codeblock-public-wrap[data-theme="vs-light"] .codeblock-public-toggle,
.codeblock-public-wrap[data-theme="solarized-light"] .codeblock-public-toggle {
  background: rgba(0, 0, 0, 0.04);
  border-top-color: rgba(0, 0, 0, 0.08);
}

.codeblock-public-toggle:hover {
  opacity: 1;
}

.codeblock-public-body pre {
  margin: 0;
  padding: var(--code-block-padding-y) 1rem;
  overflow-x: auto;
  font-size: var(--code-font-size);
  line-height: var(--code-line-height);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
  background: transparent !important;
  color: inherit;
}

.codeblock-public-body pre code,
.codeblock-public-body pre code * {
  line-height: var(--code-line-height);
  font-size: var(--code-font-size);
}

.codeblock-public-body .hljs,
.codeblock-public-body .hljs code,
.codeblock-public-body .line {
  background: transparent !important;
  color: inherit;
}

.codeblock-public-body.with-line-numbers pre code {
  counter-reset: code-line;
  display: block;
}

.codeblock-public-body.with-line-numbers .line {
  display: block;
  width: 100%;
  padding-left: 3rem;
  position: relative;
  min-height: var(--code-line-height);
  line-height: var(--code-line-height);
  font-size: var(--code-font-size);
}

.codeblock-public-body.with-line-numbers .line::before {
  counter-increment: code-line;
  content: counter(code-line);
  position: absolute;
  left: 0;
  top: 0;
  width: 2.25rem;
  height: var(--code-line-height);
  line-height: var(--code-line-height);
  text-align: right;
  color: rgba(148, 163, 184, 0.55);
  user-select: none;
  padding-right: 0.5rem;
  display: inline-block;
  font-size: var(--code-font-size);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
}
</style>
