<template>
  <div
    class="reading-progress-bar"
    role="progressbar"
    :aria-label="t('public.post.readingProgress')"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="percent"
    data-testid="reading-progress-bar"
  >
    <div class="reading-progress-fill" :style="{ transform: `scaleX(${progress})` }" />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  /** 0-1 */
  progress: number
}>()

const { t } = useI18n()
const percent = computed(() => Math.round(Math.min(1, Math.max(0, props.progress)) * 100))
</script>

<style scoped>
.reading-progress-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  height: 3px;
  pointer-events: none;
}

.reading-progress-fill {
  width: 100%;
  height: 100%;
  background: var(--pb-selected-border);
  transform-origin: left;
  transition: transform 80ms linear;
  will-change: transform;
}

@media (prefers-reduced-motion: reduce) {
  .reading-progress-fill {
    transition: none;
  }
}
</style>
