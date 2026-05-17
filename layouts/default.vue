<template>
  <div class="min-h-screen">
    <header class="border-b border-stone-200 bg-white/80 backdrop-blur">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <NuxtLink to="/" class="text-lg font-semibold tracking-normal text-stone-950">
          {{ siteName }}
        </NuxtLink>
        <nav class="flex items-center gap-2">
          <UButton to="/" variant="ghost" color="neutral" icon="i-lucide-book-open">
            Blog
          </UButton>
          <UButton to="/admin" variant="ghost" color="neutral" icon="i-lucide-lock-keyhole">
            Admin
          </UButton>
        </nav>
      </div>
    </header>
    <main>
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
const siteName = config.public.siteName
</script>