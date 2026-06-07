<template>
  <div class="flex min-h-screen flex-col bg-[var(--pb-app-bg)] text-[var(--pb-text)]" :style="siteShellStyle">
    <!-- Full-width hero header with optional photo (home only) -->
    <header v-if="isHome" class="public-site-hero relative isolate flex flex-col overflow-hidden border-b border-[var(--pb-divider)] bg-[var(--pb-hero-bg)] text-[var(--pb-text)]" :style="siteHeroStyle">
      <img
        v-if="siteBanner"
        :src="siteBanner"
        alt=""
        class="public-site-hero-image absolute inset-0 z-0 h-full w-full object-cover"
        :style="siteBannerStyle"
      >
      <div v-else class="public-site-hero-fallback" aria-hidden="true" />
      <div class="public-site-hero-overlay" aria-hidden="true" />

      <div class="relative z-10 mx-auto flex min-h-0 w-full max-w-[var(--pb-layout-hero-max)] flex-1 flex-col items-center justify-center gap-5 px-5 pt-8 pb-20 text-center">
        <div class="grid gap-3">
          <h1 class="font-[var(--pb-font-display)] text-[clamp(2.5rem,6vw,5.25rem)] font-medium leading-none tracking-normal text-[var(--pb-text-muted)] opacity-70">{{ siteName }}</h1>
          <p v-if="siteSubtitle" class="mx-auto max-w-2xl text-base leading-relaxed text-[var(--pb-text-muted)] md:text-lg">{{ siteSubtitle }}</p>
        </div>
        <BlogSearchBar variant="hero" placeholder="Search posts…" />
      </div>

      <!-- Bottom navigation strip -->
      <nav class="public-site-hero-menu absolute inset-x-0 bottom-0 z-20">
        <div class="mx-auto flex min-h-16 w-full max-w-[var(--pb-site-content-max)] items-center justify-between gap-4 px-5">
          <div class="flex min-w-0 items-center gap-1">
            <UButton
              to="/"
              variant="ghost"
              color="neutral"
              size="sm"
              icon="i-lucide-home"
            >
              <span class="hidden sm:inline">Home</span>
            </UButton>
          </div>

          <div class="flex items-center gap-2">
            <button class="grid size-9 place-items-center rounded-[var(--pb-radius-md)] text-[var(--pb-text-muted)] md:hidden" aria-label="Toggle navigation" @click="mobileNav = !mobileNav">
              <UIcon name="i-lucide-menu" class="size-5" />
            </button>
            <UButton
              variant="ghost"
              color="neutral"
              :icon="themeModeIcon"
              :aria-label="themeModeLabel"
              :title="themeModeLabel"
              size="sm"
              @click="toggleThemeMode"
            />
            <UButton v-if="isLoggedIn && authRole !== 'viewer'" to="/admin" variant="ghost" color="neutral" icon="i-lucide-layout-dashboard" size="sm">
              Admin
            </UButton>
            <UButton v-else-if="isLoggedIn" variant="ghost" color="neutral" icon="i-lucide-log-out" size="sm" :loading="loggingOut" @click="logout">
              Logout
            </UButton>
            <UButton v-else to="/login" variant="ghost" color="neutral" icon="i-lucide-log-in" size="sm">
              Login
            </UButton>
          </div>
        </div>
        <!-- Mobile nav dropdown -->
        <div v-if="mobileNav" class="px-5 py-2 md:hidden">
          <UButton
            to="/"
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-home"
            block
            @click="mobileNav = false"
          >
            Home
          </UButton>
        </div>
      </nav>
    </header>

    <!-- Compact header on inner pages: keeps the hero photo, single navigation row.
         Sticky so it stays visible while scrolling the post content. -->
    <header v-else class="public-site-header-compact sticky top-0 z-30 isolate flex overflow-hidden border-b border-[var(--pb-divider)] bg-[var(--pb-hero-bg)] text-[var(--pb-text)]" :style="siteCompactHeaderStyle">
      <img
        v-if="siteBanner"
        :src="siteBanner"
        alt=""
        class="public-site-hero-image absolute inset-0 z-0 h-full w-full object-cover"
        :style="siteBannerStyle"
      >
      <div v-else class="public-site-hero-fallback" aria-hidden="true" />
      <div class="public-site-hero-overlay" aria-hidden="true" />

      <div class="public-site-header-row relative z-10 mx-auto flex w-full max-w-[var(--pb-site-content-max)] items-center gap-2 px-5 sm:gap-3">
        <!-- Left cluster -->
        <div class="flex items-center gap-1.5 sm:gap-2">
          <UButton
            to="/"
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-home"
          >
            <span class="hidden sm:inline">Home</span>
          </UButton>
        </div>

        <!-- Right cluster: search + utilities -->
        <div class="ml-auto flex items-center gap-1.5 sm:gap-2">
          <BlogSearchBar variant="compact" placeholder="Search posts…" class="hidden md:flex" />
          <UButton
            class="md:hidden"
            to="/search"
            variant="ghost"
            color="neutral"
            icon="i-lucide-search"
            aria-label="Search"
            size="sm"
          />
          <UButton
            variant="ghost"
            color="neutral"
            :icon="themeModeIcon"
            :aria-label="themeModeLabel"
            :title="themeModeLabel"
            size="sm"
            @click="toggleThemeMode"
          />
          <UButton v-if="isLoggedIn && authRole !== 'viewer'" to="/admin" variant="ghost" color="neutral" icon="i-lucide-layout-dashboard" size="sm">
            Admin
          </UButton>
          <UButton v-else-if="isLoggedIn" variant="ghost" color="neutral" icon="i-lucide-log-out" size="sm" :loading="loggingOut" @click="logout">
            <span class="hidden sm:inline">Logout</span>
          </UButton>
          <UButton v-else to="/login" variant="ghost" color="neutral" icon="i-lucide-log-in" size="sm">
            <span class="hidden sm:inline">Login</span>
          </UButton>
        </div>
      </div>
    </header>

    <!-- Public body -->
    <div class="mx-auto w-full max-w-[var(--pb-site-content-max)] flex-1 px-5 py-8">
      <div v-if="hasLayoutSidebar" class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-10">
        <main class="min-w-0">
          <slot />
        </main>

        <aside class="space-y-4 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
          <slot v-if="hasPageSidebar" name="sidebar" />
          <template v-else>
            <BlogOwnerBio />
            <BlogTagCloud />
            <BlogCategoryList />
          </template>
        </aside>
      </div>

      <main v-else class="min-w-0">
        <slot />
      </main>
    </div>

    <!-- Footer -->
    <footer class="border-t border-[var(--pb-border)] bg-[var(--pb-surface)] text-sm text-[var(--pb-text-muted)]">
      <div class="mx-auto grid w-full max-w-[var(--pb-site-content-max)] gap-6 px-5 py-6 md:grid-cols-[1fr_auto_auto] md:items-start">
        <div>
          <div class="font-medium text-[var(--pb-text)]">{{ siteName }}</div>
          <p class="mt-1">{{ footerCopyright }}</p>
        </div>

        <nav v-if="footerLinks.length" class="flex flex-wrap gap-x-4 gap-y-2 md:justify-end">
          <NuxtLink
            v-for="link in footerLinks"
            :key="`${link.label}:${link.url}`"
            :to="link.url"
            class="hover:text-[var(--pb-link-hover)]"
          >
            {{ link.label }}
          </NuxtLink>
        </nav>

        <div v-if="footerSocial.length" class="flex gap-2 md:justify-end">
          <UButton
            v-for="link in footerSocial"
            :key="`${link.label}:${link.url}`"
            :to="link.url"
            :icon="link.icon || 'i-lucide-link'"
            :aria-label="link.label"
            variant="ghost"
            color="neutral"
            size="sm"
          />
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
const {
  siteName,
  siteSubtitle,
  siteBanner,
  siteBannerPositionX,
  siteBannerPositionY,
  siteBannerZoom,
  siteHeroHeightVh,
  siteFavicon,
  footerCopyright,
  footerLinks,
  footerSocial
} = useSiteSettings()

const mobileNav = ref(false)
const route = useRoute()
const slots = useSlots()
const {
  toggleIcon: themeModeIcon,
  toggleLabel: themeModeLabel,
  toggleThemeMode
} = useThemeMode({ storageKey: 'pb-public-color-mode' })
const { data: authSession } = await usePublicAuthSession()
const isLoggedIn = computed(() => Boolean(authSession.value?.loggedIn))
const authRole = computed(() => authSession.value?.user?.role ?? null)
const loggingOut = ref(false)
const hasPageSidebar = computed(() => Boolean(slots.sidebar))
const isHome = computed(() => route.path === '/')
const hasLayoutSidebar = computed(() => !isHome.value || hasPageSidebar.value)
const siteShellStyle = computed(() => ({
  '--pb-site-content-max': 'var(--pb-layout-content-max)'
}))
const siteBannerStyle = computed(() => ({
  objectPosition: `${siteBannerPositionX.value}% ${siteBannerPositionY.value}%`,
  transformOrigin: `${siteBannerPositionX.value}% ${siteBannerPositionY.value}%`,
  '--pb-hero-image-scale-from': String((siteBannerZoom.value / 100) * 1.02),
  '--pb-hero-image-scale-to': String((siteBannerZoom.value / 100) * 1.08)
}))
const siteHeroStyle = computed(() => ({
  height: `clamp(18rem, ${siteHeroHeightVh.value}vh, 44rem)`
}))
const siteCompactHeaderStyle = computed(() => ({
  height: 'clamp(4.5rem, 8vh, 6.5rem)'
}))

useHead(() => ({
  title: siteName.value,
  link: siteFavicon.value
    ? [{ rel: 'icon', href: siteFavicon.value }]
    : []
}))

async function logout() {
  loggingOut.value = true
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await refreshNuxtData('public-auth-session')
    await navigateTo('/')
  } finally {
    loggingOut.value = false
  }
}
</script>

<style scoped>
.public-site-hero-fallback {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 18% 10%, color-mix(in srgb, var(--pb-primary) 12%, transparent), transparent 34rem),
    linear-gradient(135deg, var(--pb-surface), var(--pb-hero-bg));
}

.public-site-hero-overlay {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--pb-surface) 38%, transparent), color-mix(in srgb, var(--pb-surface) 64%, transparent)),
    var(--pb-hero-overlay);
}

.public-site-hero-menu {
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--pb-surface) 24%, transparent));
}

.public-site-hero-image {
  animation: public-site-hero-drift 42s ease-in-out infinite alternate;
  transform: scale(var(--pb-hero-image-scale-from, 1.02)) translate3d(-0.6%, -0.25%, 0);
  will-change: transform;
}

@keyframes public-site-hero-drift {
  from {
    transform: scale(var(--pb-hero-image-scale-from, 1.02)) translate3d(-0.6%, -0.25%, 0);
  }

  to {
    transform: scale(var(--pb-hero-image-scale-to, 1.08)) translate3d(0.6%, 0.25%, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .public-site-hero-image {
    animation: none;
    transform: scale(var(--pb-hero-image-scale-from, 1.02));
  }
}

.public-site-header-compact {
  /* Re-uses .public-site-hero-fallback / -overlay / -image rules above so the
     mini-banner has the same visual treatment as the home hero, just shorter. */
  isolation: isolate;
}
</style>