<template>
  <span
    class="panda-logo"
    role="img"
    aria-label="Panda"
    :style="dimensionStyle"
  />
</template>

<script setup lang="ts">
interface Props {
  size?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  size: 28
})

const dimensionStyle = computed(() => {
  const value = typeof props.size === 'number' ? `${props.size}px` : props.size
  return { width: value, height: value }
})
</script>

<style scoped>
/*
 * The logo is a single-colour CSS mask so it always renders in the current
 * theme's ink colour (currentColor). On light themes the panda reads dark on a
 * light surface; on dark themes it reads light on a dark surface — mirroring the
 * original black-on-white artwork without shipping per-theme images.
 */
.panda-logo {
  display: inline-block;
  flex-shrink: 0;
  background-color: currentColor;
  -webkit-mask: url('/defaults/panda-logo-mask.png') center / contain no-repeat;
  mask: url('/defaults/panda-logo-mask.png') center / contain no-repeat;
}
</style>
