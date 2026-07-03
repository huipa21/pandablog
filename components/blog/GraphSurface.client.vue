<template>
  <div ref="surface" class="graph-surface" :class="{ 'is-compact': compact }" :style="surfaceStyle">
    <div
      ref="cyContainer"
      class="graph-layer graph-cy-layer is-active"
    />
    <div v-if="showControls && !isEmpty" class="graph-controls" :aria-label="t('public.graph.controls')">
      <button type="button" class="graph-control-button" :aria-label="t('public.graph.zoomIn')" @click="zoomBy(1.18)">
        <UIcon name="i-lucide-plus" class="size-4" />
      </button>
      <button type="button" class="graph-control-button" :aria-label="t('public.graph.zoomOut')" @click="zoomBy(0.85)">
        <UIcon name="i-lucide-minus" class="size-4" />
      </button>
      <button type="button" class="graph-control-button" :aria-label="t('public.graph.moveUp')" @click="panBy(0, -56)">
        <UIcon name="i-lucide-arrow-up" class="size-4" />
      </button>
      <button type="button" class="graph-control-button" :aria-label="t('public.graph.moveLeft')" @click="panBy(-56, 0)">
        <UIcon name="i-lucide-arrow-left" class="size-4" />
      </button>
      <button type="button" class="graph-control-button" :aria-label="t('public.graph.fit')" @click="fitGraph">
        <UIcon name="i-lucide-locate-fixed" class="size-4" />
      </button>
      <button type="button" class="graph-control-button" :aria-label="t('public.graph.moveRight')" @click="panBy(56, 0)">
        <UIcon name="i-lucide-arrow-right" class="size-4" />
      </button>
      <span aria-hidden="true" />
      <button type="button" class="graph-control-button" :aria-label="t('public.graph.moveDown')" @click="panBy(0, 56)">
        <UIcon name="i-lucide-arrow-down" class="size-4" />
      </button>
      <span aria-hidden="true" />
    </div>
    <div v-if="isEmpty" class="graph-empty">
      {{ emptyLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type cytoscape from 'cytoscape'
import type { Core, ElementDefinition } from 'cytoscape'
import type { GraphEdge, GraphNode } from '~/types/graph'

interface CytoscapeStyleRule {
  selector: string
  style: Record<string, string | number>
}

const props = withDefaults(defineProps<{
  mode?: 'overview' | 'detail'
  nodes?: GraphNode[]
  edges?: GraphEdge[]
  focus?: string | null
  compact?: boolean
  showControls?: boolean
  height?: string
  emptyLabel?: string
}>(), {
  mode: 'overview',
  nodes: () => [],
  edges: () => [],
  focus: null,
  compact: false,
  showControls: false,
  height: '360px',
  emptyLabel: 'No graph data yet'
})

const emit = defineEmits<{
  'node-click': [node: GraphNode]
}>()

const surface = ref<HTMLElement | null>(null)
const cyContainer = ref<HTMLElement | null>(null)
const surfaceStyle = computed(() => ({ '--graph-height': props.height }))
const isEmpty = computed(() => props.nodes.length === 0)
const { t } = useI18n()

let cy: Core | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
let renderFrame: number | null = null
let cytoscapeRegistered = false

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    cy?.resize()
    cy?.fit(undefined, layoutPadding())
    scheduleRender()
  })
  if (surface.value) resizeObserver.observe(surface.value)
  themeObserver = new MutationObserver(() => {
    cy?.style(cytoscapeStyles() as never)
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  scheduleRender()
})

onBeforeUnmount(() => {
  if (renderFrame !== null) cancelAnimationFrame(renderFrame)
  renderFrame = null
  resizeObserver?.disconnect()
  resizeObserver = null
  themeObserver?.disconnect()
  themeObserver = null
  cy?.destroy()
  cy = null
})

watch(() => [props.nodes, props.edges, props.focus, props.mode], () => {
  scheduleRender()
}, { deep: true, flush: 'post' })

function scheduleRender(attempt = 0) {
  if (!import.meta.client) return
  if (renderFrame !== null) cancelAnimationFrame(renderFrame)
  renderFrame = requestAnimationFrame(async () => {
    renderFrame = null
    await nextTick()
    const bounds = cyContainer.value?.getBoundingClientRect()
    if (props.nodes.length && (!bounds || bounds.width < 1 || bounds.height < 1) && attempt < 8) {
      scheduleRender(attempt + 1)
      return
    }
    if (props.nodes.length) {
      void renderCytoscape()
    } else {
      cy?.elements().remove()
    }
  })
}

async function renderCytoscape() {
  if (!cyContainer.value) return
  const bounds = cyContainer.value.getBoundingClientRect()
  if (bounds.width < 1 || bounds.height < 1) return

  const cytoscapeModule = await import('cytoscape')
  const cytoscape = cytoscapeModule.default
  if (!cytoscapeRegistered) {
    const { default: fcose } = await import('cytoscape-fcose')
    cytoscape.use(fcose as never)
    cytoscapeRegistered = true
  }

  if (!cy) {
    cy = cytoscape({
      container: cyContainer.value,
      elements: [],
      minZoom: 0.35,
      maxZoom: 2.5,
      style: cytoscapeStyles() as never
    })
    cy.on('tap', 'node', (event) => {
      const id = event.target.id()
      const node = props.nodes.find((candidate) => candidate.id === id)
      if (node) emit('node-click', node)
    })
  }

  cy.elements().remove()
  cy.resize()
  cy.add(toElements(props.nodes, props.edges))
  if (props.focus) {
    cy.getElementById(props.focus).addClass('is-focus')
  }
  cy.layout({
    name: 'fcose',
    animate: true,
    animationDuration: props.compact ? 260 : 420,
    fit: true,
    padding: layoutPadding(),
    nodeRepulsion: props.mode === 'overview' ? (props.compact ? 6800 : 9400) : (props.compact ? 5200 : 7800),
    idealEdgeLength: props.mode === 'overview' ? (props.compact ? 70 : 112) : (props.compact ? 54 : 92)
  } as cytoscape.LayoutOptions).run()
}

function toElements(nodes: GraphNode[], edges: GraphEdge[]): ElementDefinition[] {
  return [
    ...nodes.map((node) => ({
      data: {
        id: node.id,
        label: node.type === 'post' ? node.title : node.name,
        type: node.type,
        degree: node.type === 'post' ? node.degree : Math.max(1, node.postCount ?? 1),
        weight: node.type === 'post' ? Math.max(1, node.degree + 1) : Math.max(1, node.postCount ?? 1)
      },
      classes: node.id === props.focus ? 'is-focus' : undefined
    })),
    ...edges.map((edge) => ({ data: { id: edge.id, source: edge.source, target: edge.target, type: edge.type } }))
  ]
}

function cytoscapeStyles(): CytoscapeStyleRule[] {
  const palette = graphPalette()
  return [
    {
      selector: 'node',
      style: {
        width: props.mode === 'overview' ? 'mapData(weight, 1, 24, 10, 38)' : 'mapData(weight, 1, 12, 10, 27)',
        height: props.mode === 'overview' ? 'mapData(weight, 1, 24, 10, 38)' : 'mapData(weight, 1, 12, 10, 27)',
        label: 'data(label)',
        'font-size': props.compact ? 8 : 11,
        'font-weight': props.mode === 'overview' ? 600 : 500,
        'text-max-width': props.compact ? 84 : 126,
        'text-wrap': 'wrap',
        'text-valign': 'bottom',
        'text-margin-y': 7,
        color: palette.label,
        'text-outline-color': palette.textOutline,
        'text-outline-width': props.compact ? 1 : 2,
        'background-color': palette.post,
        'border-width': 1,
        'border-color': palette.nodeBorder,
        opacity: props.mode === 'overview' ? 0.94 : 0.86
      }
    },
    {
      selector: 'node[type = "category"]',
      style: {
        width: 'mapData(weight, 1, 30, 16, 46)',
        height: 'mapData(weight, 1, 30, 16, 46)',
        shape: 'ellipse',
        'background-color': palette.category,
        opacity: 0.96
      }
    },
    {
      selector: 'node[type = "tag"]',
      style: {
        width: 'mapData(weight, 1, 30, 9, 24)',
        height: 'mapData(weight, 1, 30, 9, 24)',
        shape: 'ellipse',
        'background-color': palette.tag,
        opacity: 0.9
      }
    },
    { selector: 'node.is-focus', style: { 'background-color': palette.focus, 'border-width': 3, 'border-color': palette.focusBorder, opacity: 1 } },
    {
      selector: 'edge',
      style: {
        width: props.mode === 'overview' ? 0.85 : 1.35,
        'line-color': palette.edge,
        'curve-style': 'bezier',
        'target-arrow-shape': 'none',
        'source-arrow-shape': 'none'
      }
    },
    { selector: 'edge[type = "link"]', style: { 'line-style': 'solid', 'line-color': palette.edge } },
    { selector: 'edge[type = "categorized"]', style: { 'line-style': 'dashed', 'line-color': palette.taxonomyEdge } },
    { selector: 'edge[type = "tagged"]', style: { 'line-style': 'dotted', 'line-color': palette.taxonomyEdge } },
    { selector: 'edge[type = "cooccurs"]', style: { 'line-color': palette.cooccursEdge, width: 0.8 } }
  ]
}

function layoutPadding() {
  return props.compact ? 10 : 48
}

function zoomBy(factor: number) {
  if (!cy || !cyContainer.value) return
  const bounds = cyContainer.value.getBoundingClientRect()
  const nextZoom = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor))
  cy.zoom({
    level: nextZoom,
    renderedPosition: {
      x: bounds.width / 2,
      y: bounds.height / 2
    }
  })
}

function panBy(x: number, y: number) {
  if (!cy) return
  const currentPan = cy.pan()
  cy.pan({ x: currentPan.x + x, y: currentPan.y + y })
}

function fitGraph() {
  cy?.fit(undefined, layoutPadding())
}

/**
 * Read a CSS custom property from the graph surface (which lives inside the
 * active `.theme-scope`), falling back through a list of alternatives and
 * finally a literal default. This keeps the graph palette bound to the active
 * theme's tokens so every theme stays independent.
 */
function readThemeColor(names: string[], fallback: string): string {
  const el = surface.value ?? document.documentElement
  const styles = getComputedStyle(el)
  for (const name of names) {
    const value = styles.getPropertyValue(name).trim()
    if (value) return value
  }
  return fallback
}

/** Convert a #rgb / #rrggbb color to an `rgba()` string with the given alpha. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().replace(/^#/, '')
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16)
    const g = parseInt(hex[1] + hex[1], 16)
    const b = parseInt(hex[2] + hex[2], 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  // Already a functional color (rgb/rgba/hsl/named) — return as-is.
  return color
}

function graphPalette() {
  const primary = readThemeColor(['--pb-primary', '--color-primary', '--color-accent'], '#24a48c')
  const primaryHover = readThemeColor(['--pb-primary-hover', '--color-primary-hover', '--color-accent-hover'], '#16826f')
  const tag = readThemeColor(['--color-panda-400', '--pb-warm'], '#77bea9')
  const focus = readThemeColor(['--color-panda-700', '--pb-link-hover'], primaryHover)
  const surfaceColor = readThemeColor(['--pb-surface', '--color-surface'], '#ffffff')
  const text = readThemeColor(['--pb-text', '--color-text'], '#14211f')
  const textSubtle = readThemeColor(['--pb-text-subtle', '--color-text-subtle'], '#8aa09a')

  return {
    post: primary,
    category: primaryHover,
    tag,
    focus,
    focusBorder: surfaceColor,
    nodeBorder: withAlpha(primaryHover, 0.2),
    label: withAlpha(text, 0.82),
    textOutline: withAlpha(surfaceColor, 0.9),
    edge: withAlpha(textSubtle, 0.32),
    taxonomyEdge: withAlpha(primary, 0.32),
    cooccursEdge: withAlpha(primary, 0.18)
  }
}
</script>

<style scoped>
.graph-surface {
  position: relative;
  min-height: var(--graph-height);
  overflow: hidden;
  border-radius: var(--pb-radius-card-inner);
  background: var(--pb-surface, var(--color-surface, #ffffff));
}

.graph-surface.is-compact {
  min-height: var(--graph-height);
}

.graph-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 280ms ease;
}

.graph-layer.is-active {
  opacity: 1;
}

.graph-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--pb-text-subtle);
  pointer-events: none;
}

.graph-controls {
  position: absolute;
  right: 0.875rem;
  bottom: 0.875rem;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(3, 2rem);
  gap: 0.375rem;
  padding: 0.5rem;
  border: 1px solid color-mix(in srgb, var(--pb-card-border) 82%, transparent);
  border-radius: var(--pb-radius-card-inner);
  background: color-mix(in srgb, var(--pb-card-bg) 88%, transparent);
  box-shadow: var(--pb-shadow-sm);
  backdrop-filter: blur(10px);
}

.graph-control-button {
  display: inline-grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--pb-card-border) 86%, transparent);
  border-radius: calc(var(--pb-radius-card-inner) - 0.5rem);
  background: color-mix(in srgb, var(--pb-card-bg) 82%, var(--pb-link) 8%);
  color: var(--pb-text);
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}

.graph-control-button:hover {
  border-color: color-mix(in srgb, var(--pb-link) 42%, var(--pb-card-border));
  background: color-mix(in srgb, var(--pb-card-bg) 72%, var(--pb-link) 18%);
  color: var(--pb-link-hover);
}

.graph-control-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--pb-link) 64%, transparent);
  outline-offset: 2px;
}
</style>