<template>
  <NodeViewWrapper class="accordion-pane" data-type="accordion-pane" :data-title="title" :data-accordion-pane-id="paneId">
    <button class="accordion-pane-header" type="button" contenteditable="false" @mousedown.prevent @click="emitToggle">
      <span class="accordion-pane-title">
        <input
          class="accordion-pane-title-input"
          :value="title"
          placeholder="Pane title"
          @input="setTitle"
          @mousedown.stop
          @click.stop
          @keydown.stop
        >
      </span>
      <span class="accordion-pane-trigger" aria-hidden="true">
        <span class="accordion-pane-plus-minus is-plus">+</span>
        <span class="accordion-pane-plus-minus is-minus">-</span>
        <svg class="accordion-pane-icon is-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
        <svg class="accordion-pane-icon is-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14m-6-6 6 6-6 6" />
        </svg>
      </span>
    </button>
    <NodeViewContent class="accordion-pane-content" />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)
const paneId = `accordion-pane-${Math.random().toString(36).slice(2)}`
const title = computed(() => String(props.node.attrs.title ?? 'Accordion Pane').trim() || 'Accordion Pane')

function setTitle(event: Event) {
  const value = (event.target as HTMLInputElement).value.trim()
  props.updateAttributes({ title: value || 'Accordion Pane' })
}

function emitToggle(event: MouseEvent) {
  event.currentTarget?.dispatchEvent(new CustomEvent('accordion-pane-toggle', {
    bubbles: true,
    detail: { paneId }
  }))
}
</script>