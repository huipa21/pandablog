<template>
  <NodeViewWrapper
    ref="nodeViewEl"
    class="customhtml-nodeview customhtml-block my-6"
    :class="{ 'is-preview-mode': mode === 'preview', 'is-source-mode': mode === 'raw', 'is-selected': selected }"
    data-node-view-wrapper
    data-theme="nord"
    data-language="javascript"
  >
    <!-- Editor-only chrome: shown only in Source mode or when the block is selected. -->
    <div
      v-if="mode === 'raw' || selected"
      class="customhtml-header"
      contenteditable="false"
      @mousedown="onHeaderMouseDown"
    >
      <div class="customhtml-header-left">
        <UIcon name="i-lucide-file-code-2" class="size-3.5 shrink-0" />
        <span class="truncate">custom-widget.html</span>
        <span class="customhtml-divider">·</span>
        <span class="customhtml-meta">JS ALLOWED (SANDBOXED)</span>
      </div>
      <div class="customhtml-header-right">
        <span class="customhtml-lang-pill">JAVASCRIPT</span>
        <div class="customhtml-tabs" role="tablist" aria-label="Custom HTML mode">
          <button
            type="button"
            class="customhtml-tab"
            :class="mode === 'raw' ? 'is-active' : ''"
            role="tab"
            :aria-selected="mode === 'raw' ? 'true' : 'false'"
            @click="mode = 'raw'"
          >Source</button>
          <button
            type="button"
            class="customhtml-tab"
            :class="mode === 'preview' ? 'is-active' : ''"
            role="tab"
            :aria-selected="mode === 'preview' ? 'true' : 'false'"
            @click="mode = 'preview'"
          >Preview</button>
        </div>
      </div>
    </div>

    <div class="customhtml-body" :class="`mode-${mode}`" contenteditable="false" @mousedown.stop="onBodyMouseDown">
      <div v-if="mode !== 'preview'" class="customhtml-code">
        <div class="customhtml-source-wrap" @mousedown.stop="onBodyMouseDown">
          <pre ref="highlightEl" class="customhtml-pre codeblock-pre hljs"><code class="customhtml-code-editor language-javascript" v-html="highlightedHtml" /></pre>
          <textarea
            ref="sourceInputEl"
            class="customhtml-input"
            spellcheck="false"
            :value="html"
            @input="onSourceInput"
            @scroll="syncSourceScroll"
          />
        </div>
      </div>

      <div v-if="mode !== 'raw'" class="customhtml-preview" @mousedown.stop="onBodyMouseDown">
        <iframe
          ref="iframeEl"
          class="customhtml-iframe"
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          referrerpolicy="no-referrer"
          loading="lazy"
          :srcdoc="iframeDoc"
          :style="{ height: `${iframeHeight}px` }"
        />
      </div>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { all, createLowlight } from 'lowlight'

type HighlightNode = {
  type?: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HighlightNode[]
}

const props = defineProps(nodeViewProps)
const lowlight = createLowlight(all)

const editorStore = useEditorStore()
const nodeViewEl = ref<HTMLElement | null>(null)
// WYSIWYG default: the editor shows the rendered preview (what the reader sees).
// Authors switch to 'raw' (source) only when actively editing markup.
const mode = ref<'raw' | 'preview'>('preview')
const selected = computed(() => Boolean(props.selected))
const html = computed(() => typeof props.node.attrs.html === 'string' ? props.node.attrs.html : '')
const sourceInputEl = ref<HTMLTextAreaElement | null>(null)
const highlightEl = ref<HTMLElement | null>(null)
const iframeEl = ref<HTMLIFrameElement | null>(null)
const iframeHeight = ref(280)
let heightUpdateTimer: NodeJS.Timeout | null = null

const iframeDoc = computed(() => buildSrcdoc(html.value))
const highlightedHtml = computed(() => {
  try {
    const tree = lowlight.highlight('javascript', html.value)
    return renderNodes(tree.children as HighlightNode[])
  } catch {
    return renderPlainText(html.value)
  }
})

function onSourceInput(event: Event) {
  const text = (event.target as HTMLTextAreaElement).value
  props.updateAttributes({ html: text })
}

function onHeaderMouseDown(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.customhtml-tabs')) {
    return
  }

  const pos = props.getPos?.()
  if (typeof pos !== 'number') return
  props.editor?.chain().focus().setNodeSelection(pos).run()
}

function onBodyMouseDown() {
  // Editing/preview interactions should not keep this node as the selected block.
  editorStore.selectBlock(null)
  emitCustomHtmlInteract()
}

function emitCustomHtmlInteract() {
  nodeViewEl.value?.dispatchEvent(new CustomEvent('customhtml-interact', { bubbles: true }))
}

function syncSourceScroll(event: Event) {
  const source = event.target as HTMLTextAreaElement
  const highlighter = highlightEl.value
  if (!highlighter) {
    return
  }

  highlighter.scrollTop = source.scrollTop
  highlighter.scrollLeft = source.scrollLeft
}

function buildSrcdoc(input: string) {
  // Wrap user content in a minimal document. The iframe is sandboxed so
  // JS executes but cannot access the parent page (no allow-same-origin).
  const bridgeScript = `<script>
    (function () {
      var heightReportTimer = null;
      var lastReportedHeight = 0;

      function postHeight() {
        if (heightReportTimer) clearTimeout(heightReportTimer);
        heightReportTimer = setTimeout(function () {
          try {
            var h = document.body.scrollHeight;
            if (h !== lastReportedHeight) {
              lastReportedHeight = h;
              parent.postMessage({ type: 'customhtml-editor-height', height: h }, '*');
            }
          } catch (e) {}
        }, 100);
      }

      function notifyInteract() {
        try { parent.postMessage({ type: 'customhtml-preview-interact' }, '*') } catch (e) {}
      }

      if (typeof ResizeObserver !== 'undefined') {
        var ro = new ResizeObserver(postHeight);
        ro.observe(document.body);
      }

      window.addEventListener('load', function () { postHeight(); setTimeout(postHeight, 120); setTimeout(postHeight, 360); });
      window.addEventListener('resize', postHeight);
      window.addEventListener('pointerdown', notifyInteract, { capture: true });
      window.addEventListener('mousedown', notifyInteract, { capture: true });
    })();
  <\/script>`

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    html,body{margin:0;padding:0;font-family:ui-sans-serif,system-ui,sans-serif;color:inherit;background:transparent;}
    *{box-sizing:border-box;}
    img,video,iframe{max-width:100%;}
  </style></head><body>${input}${bridgeScript}</body></html>`
}

function onPreviewMessage(event: MessageEvent) {
  if (!iframeEl.value || event.source !== iframeEl.value.contentWindow) {
    return
  }

  if (event.data?.type === 'customhtml-editor-height' && typeof event.data.height === 'number') {
    if (heightUpdateTimer) clearTimeout(heightUpdateTimer)
    
    heightUpdateTimer = setTimeout(() => {
      const nextHeight = Math.min(6000, Math.max(160, Math.round(event.data.height + 4)))
      const currentHeight = iframeHeight.value
      const delta = nextHeight - currentHeight

      // Ignore tiny upward steps caused by viewport-height content reacting to the iframe resize.
      if (Math.abs(delta) > 1 && !(delta > 0 && delta <= 8)) {
        iframeHeight.value = nextHeight
      }
      heightUpdateTimer = null
    }, 50)
    return
  }

  if (event.data?.type === 'customhtml-preview-interact') {
    editorStore.selectBlock(null)
    emitCustomHtmlInteract()
  }
}

function renderNodes(nodes: HighlightNode[] = []): string {
  return nodes.map((node) => renderNode(node)).join('')
}

function renderNode(node: HighlightNode): string {
  if (!node) {
    return ''
  }

  if (node.type === 'text') {
    return escapeHtml(node.value ?? '')
  }

  if (node.type === 'element' && node.tagName) {
    const classNames = Array.isArray(node.properties?.className)
      ? (node.properties?.className as string[]).filter(Boolean).join(' ')
      : ''
    const classAttr = classNames ? ` class="${escapeHtml(classNames)}"` : ''
    return `<${node.tagName}${classAttr}>${renderNodes(node.children ?? [])}</${node.tagName}>`
  }

  return renderNodes(node.children ?? [])
}

function renderPlainText(value: string): string {
  return escapeHtml(value).replaceAll('\n', '<br>')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

onMounted(() => {
  window.addEventListener('message', onPreviewMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onPreviewMessage)
  if (heightUpdateTimer) clearTimeout(heightUpdateTimer)
})
</script>

<style scoped>
.customhtml-nodeview {
  --pb-code-zoom: 1;
  background: transparent;
  color: inherit;
  border: 0;
  box-shadow: none;
  border-radius: 0;
  overflow: visible;
}

.customhtml-nodeview.is-source-mode {
  background: var(--code-bg, #2e3440);
  color: var(--code-fg, #d8dee9);
  border-radius: 0.5rem;
  overflow: hidden;
}

.customhtml-nodeview.is-preview-mode.is-selected {
  outline: 2px solid rgba(99, 102, 241, 0.45);
  outline-offset: 4px;
  border-radius: 0.25rem;
}

.customhtml-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  font-size: 0.75rem;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  opacity: 0.95;
  border-bottom: 1px solid rgba(127, 127, 127, 0.2);
}

.customhtml-header-left {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.4rem;
  font-weight: 500;
}

.customhtml-header-right {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.customhtml-divider {
  opacity: 0.5;
}

.customhtml-meta {
  opacity: 0.8;
  font-size: 0.65rem;
  letter-spacing: 0.05em;
}

.customhtml-lang-pill {
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

.customhtml-tabs {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border-radius: 0.35rem;
  border: 1px solid rgba(127, 127, 127, 0.28);
}

.customhtml-tab {
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  opacity: 0.82;
  padding: 0.18rem 0.6rem;
  font-size: 0.75rem;
  line-height: 1.2;
}

.customhtml-tab:hover {
  background: rgba(127, 127, 127, 0.2);
  opacity: 1;
}

.customhtml-tab.is-active {
  background: rgba(127, 127, 127, 0.25);
  opacity: 1;
  color: var(--code-fg, #d8dee9);
}

.customhtml-body {
  display: block;
  min-height: 9rem;
  background: var(--code-bg, #2e3440);
}

.customhtml-nodeview.is-preview-mode {
  background: #fff;
  color: #1c1917;
}

.customhtml-nodeview.is-preview-mode .customhtml-body,
.customhtml-nodeview.is-preview-mode .customhtml-preview {
  background: transparent;
}

.customhtml-code {
  background: var(--code-bg, #2e3440);
  color: var(--code-fg, #d8dee9);
}

.customhtml-source-wrap {
  position: relative;
}

.customhtml-pre {
  margin: 0;
  padding: var(--pb-code-block-padding-y) 1rem;
  overflow: auto;
  font-size: calc(var(--pb-code-font-size) * var(--pb-code-zoom, 1));
  line-height: calc(var(--pb-code-line-height) * var(--pb-code-zoom, 1));
  min-height: 9rem;
  background: var(--code-bg, #2e3440) !important;
  border: 0 !important;
  box-shadow: none !important;
  outline: 0 !important;
}

.customhtml-pre :deep(code) {
  display: block;
  background: transparent !important;
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
  color: inherit !important;
  border: 0 !important;
  box-shadow: none !important;
  padding: 0 !important;
  margin: 0 !important;
  min-height: 9rem;
}

.customhtml-code-editor {
  color: var(--code-fg, #d8dee9);
  pointer-events: none;
}

.customhtml-source-wrap:focus-within .customhtml-code-editor {
  opacity: 0;
}

.customhtml-input {
  position: absolute;
  inset: 0;
  width: 100%;
  min-height: 9rem;
  margin: 0;
  padding: var(--pb-code-block-padding-y) 1rem;
  border: 0;
  background: transparent;
  resize: none;
  overflow: auto;
  outline: none;
  color: transparent;
  caret-color: var(--code-fg, #d8dee9);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
  font-size: calc(var(--pb-code-font-size) * var(--pb-code-zoom, 1));
  line-height: calc(var(--pb-code-line-height) * var(--pb-code-zoom, 1));
  white-space: pre;
}

.customhtml-source-wrap:focus-within .customhtml-input {
  color: var(--code-fg, #d8dee9);
}

.customhtml-input::selection {
  background: rgba(129, 161, 193, 0.35);
}

.customhtml-preview {
  background: var(--code-bg, #2e3440);
}

.customhtml-iframe {
  width: 100%;
  min-height: 9rem;
  border: 0;
  display: block;
}
</style>
