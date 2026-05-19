<template>
  <div class="rounded-lg border border-stone-200 bg-white p-4">
    <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">Categories</h3>
    <div v-if="pending" class="grid gap-2">
      <USkeleton v-for="index in 4" :key="index" class="h-6" />
    </div>
    <nav v-else-if="categories.length" class="grid gap-1">
      <NuxtLink
        v-for="category in categories"
        :key="category.id"
        :to="`/category/${category.slug}`"
        class="flex items-center justify-between rounded px-2 py-1 text-sm text-stone-700 hover:bg-stone-50 hover:text-teal-700"
      >
        <span>{{ category.name }}</span>
        <span class="text-xs text-stone-400">{{ category.post_count ?? 0 }}</span>
      </NuxtLink>
    </nav>
    <p v-else class="text-sm italic text-stone-400">No categories yet.</p>
  </div>
</template>

<script setup lang="ts">
const { data, pending } = await usePublicBootstrap()
const categories = computed(() => data.value?.categories ?? [])
</script>
