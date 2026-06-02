<template>
  <section class="grid gap-6">
    <div class="flex flex-col gap-2">
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-primary)]">Workspace</p>
      <h1 class="text-3xl font-semibold tracking-normal text-[var(--pb-text)]">Dashboard</h1>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <NuxtLink to="/admin/posts" class="pb-admin-surface block p-5 transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-selected-bg)]">
        <UIcon name="i-lucide-file-text" class="mb-4 size-6 text-[var(--pb-primary)]" />
        <h2 class="text-lg font-semibold text-[var(--pb-text)]">Posts</h2>
        <p class="mt-1 text-sm text-[var(--pb-text-muted)]">Create drafts, publish essays, and manage your knowledge base.</p>
      </NuxtLink>
      <div class="pb-admin-surface border-dashed p-5 opacity-80">
        <UIcon name="i-lucide-image" class="mb-4 size-6 text-[var(--pb-text-muted)]" />
        <h2 class="text-lg font-semibold text-[var(--pb-text)]">Assets</h2>
        <p class="mt-1 text-sm text-[var(--pb-text-muted)]">Local upload management lands in the editor phase.</p>
      </div>
      <div class="pb-admin-surface border-dashed p-5 opacity-80">
        <UIcon name="i-lucide-chart-no-axes-combined" class="mb-4 size-6 text-[var(--pb-text-muted)]" />
        <h2 class="text-lg font-semibold text-[var(--pb-text)]">Analytics</h2>
        <p class="mt-1 text-sm text-[var(--pb-text-muted)]">Page views and referrers are planned after publishing is solid.</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })
</script>