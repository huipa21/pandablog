<template>
  <section class="grid gap-6">
    <div class="flex flex-col gap-2">
      <p class="text-sm font-medium uppercase tracking-wider text-teal-700">Workspace</p>
      <h1 class="text-3xl font-semibold tracking-normal text-stone-950">Dashboard</h1>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <NuxtLink to="/admin/posts" class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm transition hover:border-teal-300">
        <UIcon name="i-lucide-file-text" class="mb-4 size-6 text-teal-700" />
        <h2 class="font-semibold text-stone-950">Posts</h2>
        <p class="mt-1 text-sm text-stone-600">Create drafts, publish essays, and manage your knowledge base.</p>
      </NuxtLink>
      <div class="rounded-lg border border-dashed border-stone-300 bg-white/70 p-5">
        <UIcon name="i-lucide-image" class="mb-4 size-6 text-stone-500" />
        <h2 class="font-semibold text-stone-950">Assets</h2>
        <p class="mt-1 text-sm text-stone-600">Local upload management lands in the editor phase.</p>
      </div>
      <div class="rounded-lg border border-dashed border-stone-300 bg-white/70 p-5">
        <UIcon name="i-lucide-chart-no-axes-combined" class="mb-4 size-6 text-stone-500" />
        <h2 class="font-semibold text-stone-950">Analytics</h2>
        <p class="mt-1 text-sm text-stone-600">Page views and referrers are planned after publishing is solid.</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })
</script>