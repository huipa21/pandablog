<template>
  <div v-if="hasProfile" class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
    <div class="flex items-center gap-3">
      <img
        v-if="ownerAvatar"
        :src="ownerAvatar"
        :alt="ownerName"
        class="h-12 w-12 rounded-full object-cover"
      >
      <div v-else class="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--pb-selected-bg)] text-[var(--pb-icon-accent)]">
        <UIcon name="i-lucide-user" class="size-6 text-[var(--pb-icon-accent)]" />
      </div>
      <div>
        <div class="font-semibold text-[var(--pb-text)]">{{ ownerName }}</div>
        <div v-if="ownerMotto" class="mt-0.5 text-xs text-[var(--pb-text-subtle)]">{{ ownerMotto }}</div>
      </div>
    </div>
    <div v-if="ownerBio" class="prose prose-stone mt-3 max-w-none text-sm leading-relaxed">
      <ContentRenderer :node="ownerBio" />
    </div>
  </div>
</template>

<script setup lang="ts">
const { ownerName, ownerBio, ownerAvatar, ownerMotto } = useSiteSettings()
const hasProfile = computed(() => Boolean(ownerName.value || ownerBio.value || ownerAvatar.value || ownerMotto.value))
</script>
