<template>
  <div class="flex flex-col gap-3 border-t border-[var(--pb-border)] px-4 py-3 text-sm text-[var(--pb-text-muted)] md:flex-row md:items-center md:justify-between">
    <span>{{ t('admin.logs.showingRange', { first, last, total }) }}</span>
    <div class="flex items-center gap-2">
      <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevrons-left" :aria-label="t('admin.common.firstPage')" :disabled="currentPage <= 1" @click="goToPage(1)" />
      <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevron-left" :aria-label="t('admin.common.previousPage')" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)" />
      <span class="min-w-24 text-center">{{ t('admin.common.pageOf', { page: currentPage, total: totalPages }) }}</span>
      <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevron-right" :aria-label="t('admin.common.nextPage')" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)" />
      <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevrons-right" :aria-label="t('admin.common.lastPage')" :disabled="currentPage >= totalPages" @click="goToPage(totalPages)" />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  total: number
  limit: number
  offset: number
}>()

const emit = defineEmits<{
  (event: 'page', offset: number): void
}>()

const { t } = useI18n()
const safeLimit = computed(() => Math.max(1, props.limit || 1))
const totalPages = computed(() => Math.max(1, Math.ceil(props.total / safeLimit.value)))
const currentPage = computed(() => Math.min(totalPages.value, Math.floor(props.offset / safeLimit.value) + 1))
const first = computed(() => props.total > 0 ? props.offset + 1 : 0)
const last = computed(() => Math.min(props.offset + safeLimit.value, props.total))

function goToPage(page: number) {
  const nextPage = Math.min(Math.max(page, 1), totalPages.value)
  emit('page', (nextPage - 1) * safeLimit.value)
}
</script>