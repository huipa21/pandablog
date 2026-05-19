<template>
  <div class="theme-scope">
    <header class="blog-header" :class="{ sticky: layout?.stickyHeader }">
      <slot name="header">
        <nav><NuxtLink to="/">{{ siteName }}</NuxtLink></nav>
      </slot>
    </header>

    <div class="blog-layout">
      <aside v-if="layout?.leftSidebar" class="blog-sidebar blog-sidebar-left">
        <slot name="left-sidebar" />
      </aside>

      <main class="blog-content">
        <slot />
      </main>

      <aside v-if="layout?.rightSidebar" class="blog-sidebar blog-sidebar-right">
        <slot name="right-sidebar" />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
const { data } = await usePublicBootstrap()
const layout = computed(() => data.value?.theme?.layout)
const siteName = computed(() => {
  const settings = (data.value?.settings ?? {}) as Record<string, unknown>
  const configuredName = settings.site_title
  return typeof configuredName === 'string' && configuredName.trim()
    ? configuredName
    : config.public.siteName
})
</script>
