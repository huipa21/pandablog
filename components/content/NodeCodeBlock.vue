<template>
  <div
    :class="['codeblock-public-wrap', `code-theme-${theme}`]"
    :data-theme="theme"
    :data-language="language"
  >
    <div class="codeblock-public-header">
      <span class="font-medium normal-case tracking-normal">{{ language || 'text' }}</span>
      <button type="button" class="codeblock-public-copy" :title="copied ? 'Copied!' : 'Copy code'" @click="copy">
        <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3" />
        <span>{{ copied ? 'Copied' : 'Copy' }}</span>
      </button>
    </div>
    <ClientOnly>
      <div :class="['codeblock-public-body', lineNumbers ? 'with-line-numbers' : '']" v-html="highlightedHtml || fallbackHtml" />
      <template #fallback>
        <pre class="codeblock-public" v-html="fallbackHtml" />
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'

type ShikiModule = typeof import('shiki')

let shikiPromise: Promise<ShikiModule> | null = null
const htmlCache = new Map<string, string>()

const props = defineProps<{
  node: JsonContent
}>()

const code = computed(() => textContent(props.node))
const language = computed(() => typeof props.node.attrs?.language === 'string' ? props.node.attrs.language : 'text')
const theme = computed(() => typeof props.node.attrs?.theme === 'string' ? props.node.attrs.theme : 'github-dark')
const lineNumbers = computed(() => props.node.attrs?.lineNumbers !== false)
const copied = ref(false)
const highlightedHtml = ref('')
const fallbackHtml = computed(() => `<pre class="codeblock-public"><code>${escapeHtml(code.value)}</code></pre>`)

// Map our theme names to shiki bundled theme ids
const themeMap: Record<string, string> = {
  'github-dark': 'github-dark-default',
  'github-light': 'github-light-default',
  'vs-dark': 'dark-plus',
  'vs-light': 'light-plus',
  'monokai': 'monokai',
  'dracula': 'dracula',
  'one-dark': 'one-dark-pro',
  'solarized-dark': 'solarized-dark',
  'solarized-light': 'solarized-light',
  'nord': 'nord',
  'tomorrow-night': 'tokyo-night'
}

async function renderCode() {
  const cacheKey = `${theme.value}\u0000${language.value}\u0000${code.value}`
  const cached = htmlCache.get(cacheKey)
  if (cached) {
    highlightedHtml.value = cached
    return
  }

  const shiki = await loadShiki()
  const lang = language.value in shiki.bundledLanguages ? language.value : 'text'
  const shikiTheme = themeMap[theme.value] ?? 'github-dark-default'
  const rendered = await shiki.codeToHtml(code.value, {
    lang,
    theme: shikiTheme
  }).catch(() => fallbackHtml.value)

  htmlCache.set(cacheKey, rendered)
  highlightedHtml.value = rendered
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

function loadShiki() {
  if (!shikiPromise) shikiPromise = import('shiki')
  return shikiPromise
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
</script>

<style>
@import '~/assets/css/code-themes.css';

.codeblock-public-body pre {
  margin: 0;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  font-size: 0.875rem;
  line-height: 1.6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.codeblock-public-body.with-line-numbers pre code {
  counter-reset: code-line;
  display: block;
}

.codeblock-public-body.with-line-numbers .line {
  display: inline-block;
  width: 100%;
  padding-left: 3rem;
  position: relative;
}

.codeblock-public-body.with-line-numbers .line::before {
  counter-increment: code-line;
  content: counter(code-line);
  position: absolute;
  left: 0;
  width: 2.25rem;
  text-align: right;
  color: rgba(148, 163, 184, 0.55);
  user-select: none;
  padding-right: 0.5rem;
}
</style>
