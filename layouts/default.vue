<template>
  <div class="flex min-h-screen flex-col bg-[var(--pb-app-bg)] text-[var(--pb-text)]" :style="siteShellStyle">
    <!-- Full-width hero header with optional photo (home only) -->
    <header v-if="isHome" class="public-site-hero relative isolate hidden flex-col overflow-hidden border-b border-[var(--pb-divider)] bg-[var(--pb-hero-bg)] text-[var(--pb-text)] md:flex" :style="siteHeroStyle">
      <img
        v-if="siteBanner"
        :src="publicSiteBanner"
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
        <BlogSearchBar :key="`hero-search-${publicLocale}`" variant="hero" />
      </div>

      <!-- Bottom navigation strip -->
      <nav class="public-site-hero-menu absolute inset-x-0 bottom-0 z-20">
        <div data-public-container="hero-nav" class="mx-auto flex min-h-16 w-full max-w-[var(--pb-site-content-max)] items-center justify-between gap-4 px-5">
          <div class="flex min-w-0 items-center gap-1">
            <UButton
              to="/"
              variant="ghost"
              color="neutral"
              size="sm"
              icon="i-lucide-home"
            >
              <span class="hidden sm:inline">{{ t('public.nav.home') }}</span>
            </UButton>
          </div>

          <div class="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <UButton
              v-if="showPostViewToggle"
              data-testid="post-view-toggle"
              variant="ghost"
              color="neutral"
              :icon="postViewIcon"
              :aria-label="postViewLabel"
              :title="postViewLabel"
              size="sm"
              @click="toggleViewMode"
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
            <PublicLanguageSwitcher :key="`hero-language-${publicLocale}`" />
            <UDropdownMenu v-if="canCreateContent" :items="quickNewItems">
              <UButton type="button" variant="ghost" color="neutral" icon="i-lucide-plus" size="sm" :loading="creatingQuickPost" :aria-label="t('public.nav.new')" :title="t('public.nav.new')">
                {{ t('public.nav.new') }}
              </UButton>
            </UDropdownMenu>
            <UButton v-if="isLoggedIn && authRole !== 'viewer'" to="/admin/dashboard" variant="ghost" color="neutral" icon="i-lucide-layout-dashboard" size="sm">
              {{ t('public.nav.admin') }}
            </UButton>
            <UButton v-else-if="isLoggedIn" variant="ghost" color="neutral" icon="i-lucide-log-out" size="sm" :loading="loggingOut" @click="logout">
              {{ t('public.nav.logout') }}
            </UButton>
            <UButton v-else to="/login" variant="ghost" color="neutral" icon="i-lucide-log-in" size="sm">
              {{ t('public.nav.login') }}
            </UButton>
          </div>
        </div>
      </nav>
    </header>

    <!-- Compact header on inner pages: keeps the hero photo, single navigation row.
         Sticky so it stays visible while scrolling the post content. -->
    <header class="public-site-header-compact sticky top-0 z-30 isolate flex overflow-hidden border-b border-[var(--pb-divider)] bg-[var(--pb-hero-bg)] text-[var(--pb-text)]" :class="isHome ? 'md:hidden' : undefined" :style="siteCompactHeaderStyle">
      <img
        v-if="siteBanner"
        :src="publicSiteBanner"
        alt=""
        class="public-site-hero-image absolute inset-0 z-0 h-full w-full object-cover"
        :style="siteBannerStyle"
      >
      <div v-else class="public-site-hero-fallback" aria-hidden="true" />
      <div class="public-site-hero-overlay" aria-hidden="true" />

      <div data-public-container="compact-nav" class="public-site-header-row relative z-10 mx-auto flex w-full max-w-[var(--pb-site-content-max)] items-center gap-2 px-5 sm:gap-3">
        <!-- Left cluster -->
        <div class="flex items-center gap-1.5 sm:gap-2">
          <UButton
            to="/"
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-home"
          >
            <span class="hidden sm:inline">{{ t('public.nav.home') }}</span>
          </UButton>
        </div>

        <!-- Right cluster: search + utilities -->
        <div class="ml-auto flex items-center gap-1.5 sm:gap-2">
          <BlogSearchBar :key="`compact-search-${publicLocale}`" variant="compact" class="hidden md:flex" />
          <UButton
            class="md:hidden"
            :to="searchRoute"
            variant="ghost"
            color="neutral"
            icon="i-lucide-search"
            :aria-label="t('public.nav.search')"
            size="sm"
          />
          <UButton
            v-if="showPostViewToggle"
            data-testid="post-view-toggle"
            variant="ghost"
            color="neutral"
            :icon="postViewIcon"
            :aria-label="postViewLabel"
            :title="postViewLabel"
            size="sm"
            @click="toggleViewMode"
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
          <PublicLanguageSwitcher :key="`compact-language-${publicLocale}`" />
          <UDropdownMenu v-if="canCreateContent" :items="quickNewItems">
            <UButton type="button" variant="ghost" color="neutral" icon="i-lucide-plus" size="sm" :loading="creatingQuickPost" :aria-label="t('public.nav.new')" :title="t('public.nav.new')">
              {{ t('public.nav.new') }}
            </UButton>
          </UDropdownMenu>
          <UButton v-if="isLoggedIn && authRole !== 'viewer'" to="/admin/dashboard" variant="ghost" color="neutral" icon="i-lucide-layout-dashboard" size="sm">
            {{ t('public.nav.admin') }}
          </UButton>
          <UButton v-else-if="isLoggedIn" variant="ghost" color="neutral" icon="i-lucide-log-out" size="sm" :loading="loggingOut" @click="logout">
            <span class="hidden sm:inline">{{ t('public.nav.logout') }}</span>
          </UButton>
          <UButton v-else to="/login" variant="ghost" color="neutral" icon="i-lucide-log-in" size="sm">
            <span class="hidden sm:inline">{{ t('public.nav.login') }}</span>
          </UButton>
        </div>
      </div>
    </header>

    <!-- Public body -->
    <div
      data-public-container="body"
      class="mx-auto min-w-0 w-full max-w-[var(--pb-site-content-max)] flex-1 px-5 py-8"
      @touchstart.passive="onPublicTouchStart"
      @touchend.passive="onPublicTouchEnd"
    >
      <div v-if="hasLayoutSidebar" class="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-10">
        <main class="min-w-0">
          <slot />
        </main>

        <aside data-public-sidebar :class="sidebarClasses">
          <slot v-if="hasPageSidebar" name="sidebar" />
          <template v-else>
            <BlogOwnerBio />
            <BlogTagCloud />
            <BlogCategoryList />
          </template>
        </aside>

        <Teleport to="body">
          <div v-if="hasMobileSidebarDrawer" class="public-mobile-sidebar md:hidden" :class="mobileSidebarOpen ? 'is-open' : undefined">
            <button
              type="button"
              class="public-mobile-sidebar-backdrop"
              aria-label="Close sidebar"
              @click="mobileSidebarOpen = false"
            />
            <aside class="public-mobile-sidebar-panel" data-public-mobile-sidebar>
              <div class="mb-4 flex items-center justify-between gap-3 border-b border-[var(--pb-divider)] pb-3">
                <span class="text-sm font-semibold uppercase tracking-wider text-[var(--pb-text-subtle)]">Menu</span>
                <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" aria-label="Close sidebar" @click="mobileSidebarOpen = false" />
              </div>
              <slot v-if="hasPageSidebar" name="sidebar" />
              <template v-else>
                <BlogOwnerBio />
                <BlogTagCloud />
                <BlogCategoryList />
              </template>
            </aside>
          </div>
        </Teleport>
      </div>

      <main v-else class="min-w-0">
        <slot />
      </main>
    </div>

    <!-- Footer -->
    <footer class="border-t border-[var(--pb-border)] bg-[var(--pb-surface)] text-sm text-[var(--pb-text-muted)]">
      <div data-public-container="footer" class="mx-auto grid w-full max-w-[var(--pb-site-content-max)] gap-6 px-5 py-6 md:grid-cols-[1fr_auto_auto] md:items-start">
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

      <div v-if="hasFilingInfo" class="border-t border-[var(--pb-border)] px-5 py-3 text-xs text-[var(--pb-text-subtle)]">
        <div data-public-container="filing" class="mx-auto flex w-full max-w-[var(--pb-site-content-max)] flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center">
          <a
            v-for="filing in footerFilings"
            :key="`${filing.label}:${filing.url}`"
            :href="filing.url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 hover:text-[var(--pb-link-hover)]"
          >
            <UIcon v-if="isIconName(filing.icon)" :name="filing.icon" class="size-4 shrink-0" />
            <img v-else-if="isImageIcon(filing.icon)" :src="filing.icon" alt="" class="size-4 shrink-0 object-contain">
            <span>{{ filing.label }}</span>
          </a>
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
  footerSocial,
  footerFilings,
  hasFilingInfo
} = useSiteSettings()

const { t } = useI18n()
const adminToast = useAdminToast()
const { resolveMediaUrl } = useMediaUrl()
const { locale: publicLocale } = usePublicLocale()
const mobileNav = ref(false)
const mobileSidebarOpen = ref(false)
const publicTouchStart = ref<{ x: number, y: number } | null>(null)
const route = useRoute()
const slots = useSlots()
const {
  toggleIcon: themeModeIcon,
  toggleLabel: themeModeLabel,
  toggleThemeMode
} = useThemeMode({ storageKey: 'pb-public-color-mode' })
const {
  toggleIcon: postViewIcon,
  toggleLabel: postViewLabel,
  toggleViewMode
} = usePostViewMode()
const { data: authSession } = await usePublicAuthSession()
const isLoggedIn = computed(() => Boolean(authSession.value?.loggedIn))
const authRole = computed(() => authSession.value?.user?.role ?? null)
const canCreateContent = computed(() => isLoggedIn.value && (authRole.value === 'superadmin' || authRole.value === 'admin' || authRole.value === 'author'))
const creatingQuickPost = ref(false)
const loggingOut = ref(false)
const hasPageSidebar = computed(() => Boolean(slots.sidebar))
const isHome = computed(() => route.path === '/')
const showPostViewToggle = computed(() => {
  const path = route.path
  return path === '/' || /^\/category\/.+/.test(path) || /^\/tag\/.+/.test(path)
})
const hasLayoutSidebar = computed(() => !isHome.value || hasPageSidebar.value)
const hasMobileSidebarDrawer = computed(() => hasLayoutSidebar.value && !isHome.value)
const publicSiteBanner = computed(() => resolveMediaUrl(siteBanner.value))
const publicSiteFavicon = computed(() => resolveMediaUrl(siteFavicon.value))
const searchRoute = computed(() => route.path === '/search' ? '/search' : { path: '/search', query: { from: route.fullPath } })
const sidebarClasses = computed(() => [
  'min-w-0 space-y-4',
  isHome.value ? undefined : 'hidden md:block lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto'
])
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
const quickNewItems = computed(() => [[
  { label: t('public.nav.newPost'), icon: 'i-lucide-file-plus-2', disabled: creatingQuickPost.value, onSelect: createQuickPost },
  { label: t('public.nav.newMedia'), icon: 'i-lucide-upload', onSelect: openMediaUploader }
]])

useHead(() => ({
  title: siteName.value,
  link: publicSiteFavicon.value
    ? [{ rel: 'icon', href: publicSiteFavicon.value }]
    : []
}))

async function createQuickPost() {
  if (creatingQuickPost.value) return

  creatingQuickPost.value = true
  try {
    const post = await $fetch<{ id: string }>('/api/admin/posts', {
      method: 'POST',
      body: { title: '' }
    })
    await navigateTo({ path: `/admin/posts/${encodeURIComponent(post.id)}`, query: { new: '1' } })
  } catch (error: unknown) {
    adminToast.error(error, t('admin.posts.createFailed'))
  } finally {
    creatingQuickPost.value = false
  }
}

function openMediaUploader() {
  return navigateTo({ path: '/admin/media', query: { upload: '1' } })
}

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

watch(() => route.fullPath, () => {
  mobileSidebarOpen.value = false
})

function onPublicTouchStart(event: TouchEvent) {
  if (!isMobilePublicSidebarSwipe()) return

  const touch = event.changedTouches[0]
  if (!touch) return
  publicTouchStart.value = { x: touch.clientX, y: touch.clientY }
}

function onPublicTouchEnd(event: TouchEvent) {
  const start = publicTouchStart.value
  publicTouchStart.value = null
  if (!start || !isMobilePublicSidebarSwipe()) return

  const touch = event.changedTouches[0]
  if (!touch) return

  const deltaX = touch.clientX - start.x
  const deltaY = touch.clientY - start.y
  if (Math.abs(deltaX) < 72 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return

  const fromRightEdge = start.x >= window.innerWidth - 56
  if (deltaX < 0 && fromRightEdge) {
    mobileSidebarOpen.value = true
  }
  else if (deltaX > 0 && mobileSidebarOpen.value) {
    mobileSidebarOpen.value = false
  }
}

function isMobilePublicSidebarSwipe() {
  return import.meta.client && hasMobileSidebarDrawer.value && window.matchMedia('(max-width: 767px)').matches
}

function isIconName(value: string | undefined) {
  return Boolean(value?.startsWith('i-'))
}

function isImageIcon(value: string | undefined) {
  return Boolean(value?.startsWith('/') || value?.startsWith('http://') || value?.startsWith('https://'))
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

.public-mobile-sidebar {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
}

.public-mobile-sidebar.is-open {
  pointer-events: auto;
}

.public-mobile-sidebar-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: color-mix(in srgb, var(--pb-app-bg) 54%, transparent);
  opacity: 0;
  transition: opacity 160ms ease;
}

.public-mobile-sidebar.is-open .public-mobile-sidebar-backdrop {
  opacity: 1;
}

.public-mobile-sidebar-panel {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  width: min(86vw, 22rem);
  height: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  border-left: 1px solid var(--pb-divider);
  background: var(--pb-card-bg);
  box-shadow: var(--pb-shadow-md);
  padding: 1rem;
  transform: translateX(100%);
  transition: transform 180ms ease;
}

.public-mobile-sidebar.is-open .public-mobile-sidebar-panel {
  transform: translateX(0);
}
</style>