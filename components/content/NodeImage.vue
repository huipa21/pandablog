<template>
  <figure class="my-6">
    <NuxtImg
      :src="src"
      :alt="alt"
      class="max-h-[680px] w-full rounded-lg object-cover"
      sizes="100vw md:768px"
      loading="lazy"
    />
    <figcaption v-if="title" class="mt-2 text-sm text-stone-500">{{ title }}</figcaption>
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
</script>