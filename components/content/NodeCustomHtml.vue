<template>
  <ClientOnly>
    <div class="customhtml-block my-6">
      <iframe
        class="customhtml-iframe"
        :srcdoc="iframeDoc"
        sandbox="allow-scripts allow-forms allow-popups allow-modals"
        referrerpolicy="no-referrer"
        loading="lazy"
        @load="autoResize"
      />
    </div>
    <template #fallback>
      <noscript class="customhtml-block my-6" v-html="rawSafe" />
    </template>
  </ClientOnly>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'

const props = defineProps<{
  node: JsonContent
}>()

const rawHtml = computed(() => typeof props.node.attrs?.html === 'string' ? props.node.attrs.html : '')
const rawSafe = computed(() => rawHtml.value.replace(/<script\b[\s\S]*?<\/script>/gi, ''))

const iframeDoc = computed(() => {
  // Sandboxed iframe with allow-scripts but NOT allow-same-origin -- so any
  // JS inside cannot reach the host page (window.parent, document.cookie, etc.).
  // This lets the author embed widgets (clock, weather, charts) safely.
  // A small script auto-posts the body height back to the parent for auto-resize.
  const autoResize = `
    <script>
      function postHeight() {
        try {
          var h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
          parent.postMessage({ type: 'customhtml-height', height: h }, '*');
        } catch (e) {}
      }
      window.addEventListener('load', function () { postHeight(); setTimeout(postHeight, 250); });
      new ResizeObserver(postHeight).observe(document.body);
    <\/script>`
  const baseStyle = `<style>
    html,body{margin:0;padding:0;font-family:ui-sans-serif,system-ui,sans-serif;color:inherit;background:transparent;}
    *{box-sizing:border-box;}
    img,video,iframe{max-width:100%;}
  </style>`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${baseStyle}</head><body>${rawHtml.value}${autoResize}</body></html>`
})

const iframeRef = ref<HTMLIFrameElement | null>(null)

function onMessage(event: MessageEvent) {
  if (!event.data || typeof event.data !== 'object') return
  if (event.data.type !== 'customhtml-height') return
  if (typeof event.data.height === 'number') {
    const target = document.activeElement?.tagName === 'IFRAME' ? document.activeElement as HTMLIFrameElement : null
    // Apply to ALL custom-html iframes on this page (cheap, simple).
    document.querySelectorAll<HTMLIFrameElement>('iframe.customhtml-iframe').forEach((el) => {
      if (el.contentWindow === event.source) {
        const nextHeight = Math.min(event.data.height + 4, 4000)
        const currentHeight = el.getBoundingClientRect().height

        // Guard against feedback loops: viewport-based content (e.g. 100vh)
        // can report approximately the current iframe height on each resize.
        // Updating in tiny steps would cause endless growth.
        if (nextHeight > currentHeight && nextHeight - currentHeight <= 8) {
          return
        }

        if (Math.abs(nextHeight - currentHeight) <= 1) {
          return
        }

        el.style.height = `${nextHeight}px`
      }
    })
    void target
  }
}

function autoResize(event: Event) {
  iframeRef.value = event.target as HTMLIFrameElement
}

onMounted(() => {
  window.addEventListener('message', onMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
})
</script>

<style scoped>
.customhtml-iframe {
  width: 100%;
  min-height: 80px;
  border: 0;
  display: block;
  background: transparent;
}
</style>
