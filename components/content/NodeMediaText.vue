<template>
  <div class="mediatext-block my-6 flex overflow-hidden rounded-lg border border-stone-200" :class="mediaPosition === 'right' ? 'flex-row-reverse' : ''">
    <div class="mediatext-block-media bg-stone-50 p-3" :style="{ flex: `0 0 ${(ratio * 100).toFixed(2)}%` }">
      <figcaption v-if="mediaTitle && mediaTitlePosition === 'top'" class="mb-2 text-center text-sm text-stone-500">{{ mediaTitle }}</figcaption>
      <NuxtImg
        v-if="mediaSrc"
        :src="mediaSrc"
        :alt="mediaAlt"
        :width="mediaWidth || undefined"
        :height="mediaHeight || undefined"
        class="block w-full rounded-md"
        loading="lazy"
      />
      <figcaption v-if="mediaTitle && mediaTitlePosition !== 'top'" class="mt-2 text-center text-sm text-stone-500">{{ mediaTitle }}</figcaption>
    </div>
    <div class="mediatext-block-text min-w-0 flex-1 px-4 py-3">
      <ContentRenderer v-for="(child, i) in props.node.content ?? []" :key="i" :node="child" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'
import ContentRenderer from './ContentRenderer.vue'

const props = defineProps<{
  node: JsonContent
}>()

const mediaSrc = computed(() => String(props.node.attrs?.mediaSrc ?? ''))
const mediaAlt = computed(() => String(props.node.attrs?.mediaAlt ?? ''))
const mediaTitle = computed(() => String(props.node.attrs?.mediaTitle ?? ''))
const mediaTitlePosition = computed(() => String(props.node.attrs?.mediaTitlePosition ?? 'bottom'))
const mediaWidth = computed(() => Number(props.node.attrs?.mediaWidth ?? 0) || null)
const mediaHeight = computed(() => Number(props.node.attrs?.mediaHeight ?? 0) || null)
const mediaPosition = computed(() => String(props.node.attrs?.mediaPosition ?? 'left'))
const ratio = computed(() => {
  const v = Number(props.node.attrs?.ratio ?? 0.5)
  return Number.isFinite(v) ? Math.max(0.15, Math.min(0.85, v)) : 0.5
})
</script>
