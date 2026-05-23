<template>
  <div class="mediatext-block my-6 flex overflow-hidden rounded-lg border border-stone-200" :class="mediaPosition === 'right' ? 'flex-row-reverse' : ''">
    <div class="mediatext-block-media bg-stone-50 p-3" :style="{ flex: `0 0 ${(ratio * 100).toFixed(2)}%` }">
      <figcaption v-if="mediaTitle && mediaTitlePosition === 'top'" class="mb-2 text-center text-sm text-stone-500">{{ mediaTitle }}</figcaption>
      <template v-if="mediaSrc">
        <NuxtImg
          v-if="kind === 'image'"
          :src="mediaSrc"
          :alt="mediaAlt"
          :width="mediaWidth || undefined"
          :height="mediaHeight || undefined"
          class="block w-full rounded-md"
          loading="lazy"
        />
        <video
          v-else-if="kind === 'video'"
          :src="mediaSrc"
          controls
          class="block w-full rounded-md"
        />
        <audio v-else-if="kind === 'audio'" :src="mediaSrc" controls class="block w-full" />
        <embed
          v-else-if="kind === 'pdf'"
          :src="mediaSrc"
          type="application/pdf"
          class="block h-72 w-full rounded-md"
        >
        <a
          v-else
          :href="mediaSrc"
          target="_blank"
          rel="noopener"
          class="flex items-center gap-3 rounded-md border border-stone-200 bg-white p-3 text-sm hover:border-teal-400 hover:bg-teal-50"
        >
          <UIcon :name="icon" class="size-8 text-stone-500" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium text-stone-800">{{ mediaName || mediaAlt || displayName }}</span>
            <span class="block text-xs text-stone-500">{{ formatBytes(mediaSize) }} {{ mediaMime }}</span>
          </span>
          <UIcon name="i-lucide-download" class="size-4 shrink-0 text-stone-400" />
        </a>
      </template>
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
import { classifyMedia, mediaIcon, formatBytes } from '~/composables/useMediaKind'

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
const mediaMime = computed(() => String(props.node.attrs?.mediaMime ?? ''))
const mediaName = computed(() => String(props.node.attrs?.mediaName ?? ''))
const mediaSize = computed(() => Number(props.node.attrs?.mediaSize ?? 0) || null)
const ratio = computed(() => {
  const v = Number(props.node.attrs?.ratio ?? 0.5)
  return Number.isFinite(v) ? Math.max(0.15, Math.min(0.85, v)) : 0.5
})

const kind = computed(() => classifyMedia(mediaMime.value, mediaSrc.value))
const icon = computed(() => mediaIcon(mediaMime.value, mediaSrc.value))
const displayName = computed(() => {
  const last = (mediaSrc.value.split('/').pop() ?? '').split('?')[0] ?? ''
  return last || 'Attachment'
})
</script>
