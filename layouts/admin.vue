<template>
  <div class="min-h-screen bg-stone-100">
    <!-- Top bar -->
    <header class="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-stone-200 bg-white px-4">
      <div class="flex items-center gap-3">
        <button v-if="!hideSidebar" class="md:hidden" @click="sidebarOpen = !sidebarOpen">
          <UIcon name="i-lucide-menu" class="size-5 text-stone-700" />
        </button>
        <NuxtLink to="/admin" class="flex items-center gap-2 text-lg font-semibold text-stone-950">
          <img v-if="siteLogo" :src="siteLogo" alt="" class="h-7 w-auto">
          <UIcon v-else name="i-lucide-square-pen" class="size-5 text-teal-700" />
          <span class="hidden sm:inline">{{ siteName }}</span>
        </NuxtLink>
      </div>
      <div class="flex items-center gap-2">
        <UButton to="/" variant="ghost" color="neutral" icon="i-lucide-external-link" size="sm">
          View site
        </UButton>
        <UButton variant="ghost" color="neutral" icon="i-lucide-log-out" size="sm" :loading="loggingOut" @click="logout">
          <span class="hidden sm:inline">Sign out</span>
        </UButton>
      </div>
    </header>

    <!-- Sidebar overlay (mobile) -->
    <div v-if="!hideSidebar && sidebarOpen" class="fixed inset-0 z-40 bg-black/30 md:hidden" @click="sidebarOpen = false" />

    <!-- Sidebar -->
    <aside
      v-if="!hideSidebar"
      class="fixed inset-y-0 left-0 z-50 w-60 border-r border-stone-200 bg-white pt-14 transition-transform md:translate-x-0"
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <nav class="flex flex-col gap-1 px-3 py-4">
        <UButton to="/admin" variant="ghost" color="neutral" icon="i-lucide-layout-dashboard" block @click="sidebarOpen = false">
          Dashboard
        </UButton>

        <div class="mt-4 mb-1 px-2 text-xs font-medium uppercase tracking-wider text-stone-400">Posts</div>
        <UButton to="/admin/posts" variant="ghost" color="neutral" icon="i-lucide-file-text" block @click="sidebarOpen = false">
          All posts
        </UButton>
        <UButton to="/admin/categories" variant="ghost" color="neutral" icon="i-lucide-folder" block @click="sidebarOpen = false">
          Categories
        </UButton>
        <UButton to="/admin/tags" variant="ghost" color="neutral" icon="i-lucide-tags" block @click="sidebarOpen = false">
          Tags
        </UButton>
        <UButton to="/admin/media" variant="ghost" color="neutral" icon="i-lucide-image" block @click="sidebarOpen = false">
          Media library
        </UButton>

        <div class="mt-4 mb-1 px-2 text-xs font-medium uppercase tracking-wider text-stone-400">Settings</div>
        <UButton to="/admin/settings/site" variant="ghost" color="neutral" icon="i-lucide-globe" block @click="sidebarOpen = false">
          Site
        </UButton>
        <UButton to="/admin/settings/profile" variant="ghost" color="neutral" icon="i-lucide-user" block @click="sidebarOpen = false">
          Profile
        </UButton>
        <UButton to="/admin/settings/footer" variant="ghost" color="neutral" icon="i-lucide-panel-bottom" block @click="sidebarOpen = false">
          Footer
        </UButton>
        <UButton to="/admin/settings/visibility" variant="ghost" color="neutral" icon="i-lucide-eye" block @click="sidebarOpen = false">
          Visibility
        </UButton>
        <UButton to="/admin/settings/themes" variant="ghost" color="neutral" icon="i-lucide-palette" block @click="sidebarOpen = false">
          Themes
        </UButton>

        <div class="mt-4 mb-1 px-2 text-xs font-medium uppercase tracking-wider text-stone-400">Logs</div>
        <UButton to="/admin/logs" variant="ghost" color="neutral" icon="i-lucide-chart-column" block @click="sidebarOpen = false">
          Dashboard
        </UButton>
        <UButton to="/admin/logs/access" variant="ghost" color="neutral" icon="i-lucide-globe" block @click="sidebarOpen = false">
          Access logs
        </UButton>
        <UButton to="/admin/logs/activity" variant="ghost" color="neutral" icon="i-lucide-notebook-pen" block @click="sidebarOpen = false">
          Activity logs
        </UButton>
        <UButton to="/admin/logs/errors" variant="ghost" color="neutral" icon="i-lucide-triangle-alert" block @click="sidebarOpen = false">
          Error logs
        </UButton>
        <UButton to="/admin/logs/settings" variant="ghost" color="neutral" icon="i-lucide-settings-2" block @click="sidebarOpen = false">
          Logging settings
        </UButton>
      </nav>
    </aside>

    <!-- Main content -->
    <div class="pt-14" :class="hideSidebar ? '' : 'md:pl-60'">
      <main :class="mainClass">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
const siteName = config.public.siteName
const siteLogo = config.public.siteLogo
const route = useRoute()
const hideSidebar = computed(() => route.meta.adminHideSidebar === true)

const sidebarOpen = ref(false)
const loggingOut = ref(false)
const mainClass = computed(() => route.meta.adminWide === true ? 'min-w-0' : 'min-w-0 px-5 py-8')

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