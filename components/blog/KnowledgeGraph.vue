<template>
  <div class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-4 shadow-[var(--pb-shadow-sm)]">
    <div class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--pb-text-subtle)]">
      <UIcon name="i-lucide-network" class="size-4 text-[var(--pb-icon-muted)]" />
      {{ t('public.sidebar.knowledgeGraph') }}
    </div>
    <div class="rounded-[var(--pb-radius-card-inner)] border border-dashed border-[var(--pb-divider-strong)] bg-[var(--pb-surface-subtle)] p-4 text-sm text-[var(--pb-text-subtle)]">
      {{ t('public.sidebar.knowledgeGraphDescription') }}
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
</script>
