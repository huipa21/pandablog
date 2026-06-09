<template>
  <div aria-hidden="true" />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

await navigateTo('/admin/settings/general', { redirectCode: 301, replace: true })
</script>