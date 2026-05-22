<template>
  <ClientOnly>
    <div class="customhtml-block my-6" v-html="sanitized" />
    <template #fallback>
      <div class="customhtml-block my-6" v-html="rawSafe" />
    </template>
  </ClientOnly>
</template>

<script setup lang="ts">
import DOMPurify from 'dompurify'
import type { JsonContent } from '~/types/content'

const props = defineProps<{
  node: JsonContent
}>()

const rawHtml = computed(() => typeof props.node.attrs?.html === 'string' ? props.node.attrs.html : '')
const sanitized = computed(() => DOMPurify.sanitize(rawHtml.value, { USE_PROFILES: { html: true } }))
const rawSafe = computed(() => rawHtml.value.replace(/<script\b[\s\S]*?<\/script>/gi, ''))
</script>
