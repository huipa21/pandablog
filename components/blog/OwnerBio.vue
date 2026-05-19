<template>
  <div v-if="hasProfile" class="rounded-lg border border-stone-200 bg-white p-4">
    <div class="flex items-center gap-3">
      <img
        v-if="ownerAvatar"
        :src="ownerAvatar"
        :alt="ownerName"
        class="h-12 w-12 rounded-full object-cover"
      >
      <div v-else class="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-700">
        <UIcon name="i-lucide-user" class="size-6" />
      </div>
      <div>
        <div class="font-semibold text-stone-900">{{ ownerName }}</div>
        <div v-if="ownerMotto" class="mt-0.5 text-xs text-stone-500">{{ ownerMotto }}</div>
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
