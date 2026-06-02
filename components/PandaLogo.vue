<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    role="img"
    aria-label="Panda"
    :width="size"
    :height="size"
    class="panda-logo"
  >
    <!-- ears (dark) -->
    <ellipse cx="14" cy="14" rx="9" ry="9" fill="currentColor" opacity="0.9" />
    <ellipse cx="50" cy="14" rx="9" ry="9" fill="currentColor" opacity="0.9" />
    <!-- inner ears -->
    <ellipse cx="14" cy="14" rx="4" ry="4" fill="#ffe9c8" opacity="0.6" />
    <ellipse cx="50" cy="14" rx="4" ry="4" fill="#ffe9c8" opacity="0.6" />
    <!-- head (light) -->
    <ellipse cx="32" cy="36" rx="22" ry="20" fill="#ffffff" stroke="currentColor" stroke-width="2" />
    <!-- eye patches -->
    <ellipse cx="23" cy="34" rx="5.5" ry="7" fill="currentColor" transform="rotate(-18 23 34)" />
    <ellipse cx="41" cy="34" rx="5.5" ry="7" fill="currentColor" transform="rotate(18 41 34)" />
    <!-- eyes -->
    <circle cx="23.5" cy="35" r="1.7" fill="#ffffff" />
    <circle cx="40.5" cy="35" r="1.7" fill="#ffffff" />
    <!-- nose -->
    <ellipse cx="32" cy="42" rx="2.6" ry="2" fill="currentColor" />
    <!-- mouth -->
    <path d="M32 44 Q29 49 26 47" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" />
    <path d="M32 44 Q35 49 38 47" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" />
  </svg>
</template>

<script setup lang="ts">
interface Props {
  size?: number | string
}

withDefaults(defineProps<Props>(), {
  size: 28
})
</script>

<style scoped>
.panda-logo {
  display: inline-block;
  flex-shrink: 0;
}
</style>
