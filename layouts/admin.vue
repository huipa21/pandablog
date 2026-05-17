<template>
  <div class="min-h-screen bg-stone-100">
    <aside class="fixed inset-y-0 left-0 hidden w-64 border-r border-stone-200 bg-white px-4 py-5 md:block">
      <NuxtLink to="/admin" class="flex items-center gap-2 px-2 text-lg font-semibold text-stone-950">
        <UIcon name="i-lucide-square-pen" class="size-5 text-teal-700" />
        PandaBlog
      </NuxtLink>
      <nav class="mt-8 grid gap-1">
        <UButton to="/admin" variant="ghost" color="neutral" icon="i-lucide-layout-dashboard" block>
          Dashboard
        </UButton>
        <UButton to="/admin/posts" variant="ghost" color="neutral" icon="i-lucide-file-text" block>
          Posts
        </UButton>
      </nav>
      <div class="absolute bottom-5 left-4 right-4">
        <UButton variant="ghost" color="neutral" icon="i-lucide-log-out" block :loading="loggingOut" @click="logout">
          Sign out
        </UButton>
      </div>
    </aside>

    <div class="md:pl-64">
      <header class="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white/90 px-5 py-3 backdrop-blur md:hidden">
        <NuxtLink to="/admin" class="font-semibold text-stone-950">PandaBlog</NuxtLink>
        <UButton icon="i-lucide-log-out" variant="ghost" color="neutral" :loading="loggingOut" @click="logout" />
      </header>
      <main class="mx-auto max-w-6xl px-5 py-8">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
const loggingOut = ref(false)

async function logout() {
  loggingOut.value = true
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await navigateTo('/admin/login')
  } finally {
    loggingOut.value = false
  }
}
</script>