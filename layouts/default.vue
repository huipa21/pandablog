<template>
  <div class="flex min-h-screen flex-col bg-stone-50">
    <!-- Full-width header with optional banner -->
    <header class="relative bg-stone-900 text-white">
      <img
        v-if="siteBanner"
        :src="siteBanner"
        alt=""
        class="absolute inset-0 h-full w-full object-cover opacity-60"
      >
      <div class="relative flex w-full items-center gap-4 px-5 py-6">
        <img v-if="siteLogo" :src="siteLogo" alt="" class="h-10 w-auto rounded">
        <div>
          <h1 class="text-xl font-bold tracking-tight">{{ siteName }}</h1>
          <p v-if="siteSubtitle" class="text-sm text-stone-300">{{ siteSubtitle }}</p>
        </div>
      </div>
    </header>

    <!-- Navigation strip -->
    <nav class="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div class="flex w-full items-center justify-between px-5">
        <div class="flex items-center gap-1">
          <button class="py-3 md:hidden" @click="mobileNav = !mobileNav">
            <UIcon name="i-lucide-menu" class="size-5 text-stone-700" />
          </button>
          <div class="hidden items-center gap-1 md:flex">
            <UButton to="/" variant="ghost" color="neutral" size="sm">Home</UButton>
            <UButton to="/" variant="ghost" color="neutral" size="sm">Blog</UButton>
          </div>
        </div>
        <UButton to="/admin/login" variant="ghost" color="neutral" icon="i-lucide-log-in" size="sm">
          Login
        </UButton>
      </div>
      <!-- Mobile nav dropdown -->
      <div v-if="mobileNav" class="border-t border-stone-100 px-5 py-2 md:hidden">
        <UButton to="/" variant="ghost" color="neutral" size="sm" block @click="mobileNav = false">Home</UButton>
        <UButton to="/" variant="ghost" color="neutral" size="sm" block @click="mobileNav = false">Blog</UButton>
      </div>
    </nav>

    <!-- Two-column body -->
    <div class="grid w-full max-w-[88rem] mx-auto flex-1 items-start gap-6 px-5 py-8 md:grid-cols-[minmax(0,1fr)_280px]">
      <!-- Main content -->
      <main class="min-w-0">
        <slot />
      </main>

      <!-- Right sidebar (widgets) -->
      <aside class="hidden space-y-4 md:block sticky top-[4.5rem] max-h-[calc(100vh-5rem)] overflow-y-auto">
        <slot name="sidebar">
          <BlogOwnerBio />
          <BlogSearchBar />
          <BlogTagCloud />
          <BlogCategoryList />
        </slot>
      </aside>
    </div>

    <!-- Footer -->
    <footer class="border-t border-stone-200 bg-white text-sm text-stone-500">
      <div class="grid w-full gap-6 px-5 py-6 md:grid-cols-[1fr_auto_auto] md:items-start">
        <div>
          <div class="font-medium text-stone-700">{{ siteName }}</div>
          <p class="mt-1">{{ footerCopyright }}</p>
        </div>

        <nav v-if="footerLinks.length" class="flex flex-wrap gap-x-4 gap-y-2 md:justify-end">
          <NuxtLink
            v-for="link in footerLinks"
            :key="`${link.label}:${link.url}`"
            :to="link.url"
            class="hover:text-teal-700"
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
  siteLogo,
  siteBanner,
  siteFavicon,
  footerCopyright,
  footerLinks,
  footerSocial
} = useSiteSettings()

const mobileNav = ref(false)

useHead(() => ({
  title: siteName.value,
  link: siteFavicon.value
    ? [{ rel: 'icon', href: siteFavicon.value }]
    : []
}))
</script>