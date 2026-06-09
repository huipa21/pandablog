<template>
  <component :is="icon" class="file-icon" :style="iconStyle" aria-hidden="true" />
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'

const props = withDefaults(defineProps<{
  filename: string
  size?: number | string
}>(), {
  size: 20
})

const { resolveIcon } = useFileIcon()
const icon = computed(() => resolveIcon(props.filename))
const iconStyle = computed<CSSProperties>(() => {
  const size = typeof props.size === 'number' ? `${props.size}px` : props.size
  return { width: size, height: size }
})
</script>

<style scoped>
.file-icon {
  display: block;
  flex: 0 0 auto;
}
</style>