<template>
  <section />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

await navigateTo('/admin/settings/general', { replace: true })
</script>
