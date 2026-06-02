<template>
  <div class="pb-admin-shell">
    <!-- Top bar -->
    <header
      class="fixed inset-x-0 top-0 z-30 px-3 py-3 md:px-6"
      :class="hideSidebar ? 'md:left-0' : (collapsed ? 'md:left-[68px]' : 'md:left-64')"
    >
      <div class="pb-admin-topbar flex h-14 items-center justify-between px-4">
        <div class="flex items-center gap-3">
          <button
            v-if="!hideSidebar"
            class="grid size-10 place-items-center rounded-[var(--pb-radius-md)] text-[var(--pb-text-muted)] md:hidden"
            aria-label="Open navigation"
            @click="sidebarOpen = !sidebarOpen"
          >
            <UIcon name="i-lucide-menu" class="size-5" />
          </button>
          <NuxtLink to="/admin" class="flex items-center gap-2 text-xl font-semibold text-[var(--pb-text)]">
            <img v-if="siteLogo" :src="siteLogo" alt="" class="h-7 w-auto">
            <PandaLogo v-else :size="28" class="text-[var(--pb-primary)]" />
            <span class="hidden sm:inline">{{ siteName }}</span>
          </NuxtLink>
        </div>
        <div class="flex items-center gap-2">
          <div class="hidden md:block">
            <BlogSearchBar variant="header" placeholder="Search posts…" />
          </div>
          <UButton to="/" variant="ghost" color="neutral" icon="i-lucide-external-link" size="sm">
            View site
          </UButton>
          <UButton variant="ghost" color="neutral" icon="i-lucide-log-out" size="sm" :loading="loggingOut" @click="logout">
            <span class="hidden sm:inline">Sign out</span>
          </UButton>
        </div>
      </div>
    </header>

    <!-- Sidebar overlay (mobile) -->
    <div v-if="!hideSidebar && sidebarOpen" class="fixed inset-0 z-40 bg-black/30 md:hidden" @click="sidebarOpen = false" />

    <!-- Sidebar drawer -->
    <aside
      v-if="!hideSidebar"
      class="pb-admin-sidebar fixed inset-y-0 left-0 z-50 flex w-64 flex-col px-3 py-4 transition-[width,transform] duration-200 ease-out"
      :class="[
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        collapsed ? 'md:w-[68px]' : 'md:w-64',
        'md:translate-x-0'
      ]"
    >
      <NuxtLink
        to="/admin"
        class="mb-4 flex h-12 items-center gap-3 rounded-[var(--pb-radius-lg)] bg-white/12 px-3 text-white"
        :class="collapsed ? 'md:justify-center md:px-0' : ''"
        :title="collapsed ? siteName : undefined"
        @click="closeIfMobile"
      >
        <img v-if="siteLogo" :src="siteLogo" alt="" class="h-7 w-7 shrink-0">
        <PandaLogo v-else :size="28" class="text-white" />
        <span v-if="!collapsed" class="truncate font-semibold">{{ siteName }}</span>
      </NuxtLink>

      <nav class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
        <template v-for="section in navSections" :key="section.label || 'root'">
          <div
            v-if="section.label && !collapsed"
            class="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-white/60"
          >
            {{ section.label }}
          </div>
          <div
            v-else-if="section.label && collapsed"
            class="mx-2 my-3 hidden border-t border-white/20 md:block"
            aria-hidden="true"
          />
          <NuxtLink
            v-for="item in section.items"
            :key="item.to"
            :to="item.to"
            class="group flex min-h-11 items-center gap-3 rounded-[var(--pb-radius-lg)] px-3 text-sm font-medium transition"
            :class="[
              collapsed ? 'md:justify-center md:px-0' : '',
              isActiveNav(item.to)
                ? 'bg-white text-[var(--pb-primary)] shadow-[var(--pb-shadow-sm)]'
                : 'text-white/90 hover:bg-white/14 hover:text-white'
            ]"
            :title="collapsed ? item.label : undefined"
            @click="closeIfMobile"
          >
            <UIcon :name="item.icon" class="size-5 shrink-0" />
            <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
          </NuxtLink>
        </template>
      </nav>

      <button
        type="button"
        class="mt-3 hidden h-10 items-center gap-2 rounded-[var(--pb-radius-lg)] px-3 text-sm font-medium text-white/85 transition hover:bg-white/14 hover:text-white md:flex"
        :class="collapsed ? 'md:justify-center md:px-0' : ''"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="toggleCollapsed"
      >
        <UIcon :name="collapsed ? 'i-lucide-chevrons-right' : 'i-lucide-chevrons-left'" class="size-5 shrink-0" />
        <span v-if="!collapsed">Collapse</span>
      </button>
    </aside>

    <!-- Main content -->
    <div class="pt-20" :class="hideSidebar ? '' : (collapsed ? 'md:pl-[68px]' : 'md:pl-64')">
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
const mainClass = computed(() => route.meta.adminWide === true ? 'min-w-0' : 'min-w-0 px-4 py-8 md:px-8')

const STORAGE_KEY = 'pb-admin-sidebar-collapsed'
const AUTO_COLLAPSE_BREAKPOINT = 1280
const userPreference = ref<boolean | null>(null)
const autoCollapsed = ref(false)
const collapsed = computed(() => userPreference.value ?? autoCollapsed.value)

function toggleCollapsed() {
  userPreference.value = !collapsed.value
  if (import.meta.client) {
    try {
      localStorage.setItem(STORAGE_KEY, userPreference.value ? '1' : '0')
    } catch {}
  }
}

function closeIfMobile() {
  sidebarOpen.value = false
}

function syncAutoCollapse() {
  if (!import.meta.client) return
  autoCollapsed.value = window.innerWidth < AUTO_COLLAPSE_BREAKPOINT
}

onMounted(() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === '0' || stored === '1') {
      userPreference.value = stored === '1'
    }
  } catch {}
  syncAutoCollapse()
  window.addEventListener('resize', syncAutoCollapse)
})

onBeforeUnmount(() => {
  if (import.meta.client) {
    window.removeEventListener('resize', syncAutoCollapse)
  }
})

const navSections = [
  {
    label: '',
    items: [
      { to: '/admin', label: 'Dashboard', icon: 'i-lucide-layout-dashboard' }
    ]
  },
  {
    label: 'Posts',
    items: [
      { to: '/admin/posts', label: 'All posts', icon: 'i-lucide-file-text' },
      { to: '/admin/categories', label: 'Categories', icon: 'i-lucide-folder' },
      { to: '/admin/tags', label: 'Tags', icon: 'i-lucide-tags' },
      { to: '/admin/media', label: 'Media library', icon: 'i-lucide-image' }
    ]
  },
  {
    label: 'Settings',
    items: [
      { to: '/admin/settings/site', label: 'Site', icon: 'i-lucide-globe' },
      { to: '/admin/settings/profile', label: 'Profile', icon: 'i-lucide-user' },
      { to: '/admin/settings/footer', label: 'Footer', icon: 'i-lucide-panel-bottom' },
      { to: '/admin/settings/visibility', label: 'Visibility', icon: 'i-lucide-eye' },
      { to: '/admin/settings/themes', label: 'Themes', icon: 'i-lucide-palette' }
    ]
  },
  {
    label: 'Logs',
    items: [
      { to: '/admin/logs', label: 'Dashboard', icon: 'i-lucide-chart-column' },
      { to: '/admin/logs/access', label: 'Access logs', icon: 'i-lucide-globe' },
      { to: '/admin/logs/activity', label: 'Activity logs', icon: 'i-lucide-notebook-pen' },
      { to: '/admin/logs/errors', label: 'Error logs', icon: 'i-lucide-triangle-alert' },
      { to: '/admin/logs/settings', label: 'Logging settings', icon: 'i-lucide-settings-2' }
    ]
  }
]

function isActiveNav(to: string) {
  if (to === '/admin') return route.path === to
  return route.path === to || route.path.startsWith(`${to}/`)
}

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
