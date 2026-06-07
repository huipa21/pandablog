<template>
  <main />
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()

await navigateTo({
  path: '/login',
  query: { redirect: String(route.query.redirect ?? '/admin') }
}, { replace: true })
</script>