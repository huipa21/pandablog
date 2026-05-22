<template>
  <figure class="my-6 flex flex-col" :class="alignClass">
    <figcaption v-if="title && titlePosition === 'top'" class="mb-2 text-sm text-stone-500">{{ title }}</figcaption>
    <NuxtImg
      :src="src"
      :alt="alt"
      :width="width || undefined"
      :height="height || undefined"
      :style="imgStyle"
      class="max-w-full rounded-lg"
      sizes="100vw md:768px"
      loading="lazy"
    />
    <figcaption v-if="title && titlePosition !== 'top'" class="mt-2 text-sm text-stone-500">{{ title }}</figcaption>
  </figure>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'

const props = defineProps<{
  node: JsonContent
}>()

const src = computed(() => typeof props.node.attrs?.src === 'string' ? props.node.attrs.src : '')
const alt = computed(() => typeof props.node.attrs?.alt === 'string' ? props.node.attrs.alt : '')
const title = computed(() => typeof props.node.attrs?.title === 'string' ? props.node.attrs.title : '')
const titlePosition = computed(() => typeof props.node.attrs?.titlePosition === 'string' ? props.node.attrs.titlePosition : 'bottom')
const width = computed(() => Number(props.node.attrs?.width ?? 0) || null)
const height = computed(() => Number(props.node.attrs?.height ?? 0) || null)
const align = computed(() => typeof props.node.attrs?.align === 'string' ? props.node.attrs.align : 'center')

const alignClass = computed(() => {
  switch (align.value) {
    case 'left': return 'items-start'
    case 'right': return 'items-end'
    default: return 'items-center'
  }
})

const imgStyle = computed(() => ({
  width: width.value ? `${width.value}px` : undefined,
  height: height.value ? `${height.value}px` : undefined
}))
</script>
