<template>
  <UPopover :content="{ side: 'bottom', align, sideOffset: 6 }">
    <button
      type="button"
      class="group inline-flex w-full items-center gap-1.5 text-left text-xs font-medium uppercase tracking-wider transition-colors"
      :class="highlighted ? 'text-[var(--pb-text)]' : 'text-[var(--pb-text-subtle)] hover:text-[var(--pb-text)]'"
    >
      <span class="truncate">{{ label }}</span>
      <UIcon v-if="sortDir === 'asc'" name="i-lucide-arrow-up" class="size-3.5 shrink-0 text-[var(--pb-primary)]" />
      <UIcon v-else-if="sortDir === 'desc'" name="i-lucide-arrow-down" class="size-3.5 shrink-0 text-[var(--pb-primary)]" />
      <span v-if="active" class="size-1.5 shrink-0 rounded-full bg-[var(--pb-primary)]" />
      <UIcon name="i-lucide-chevron-down" class="ml-auto size-3.5 shrink-0 opacity-50 transition group-hover:opacity-80" />
    </button>

    <template #content>
      <div
        class="grid gap-3 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-3 text-[var(--pb-text)] shadow-[var(--pb-shadow-lg)]"
        :style="{ width: `${width}px` }"
      >
        <div v-if="sortable" class="grid gap-1.5">
          <span class="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--pb-text-subtle)]">{{ t('admin.posts.columnFilter.sort') }}</span>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              class="inline-flex items-center justify-center gap-1.5 rounded-[var(--pb-radius-sm)] border px-2 py-1.5 text-xs font-medium transition"
              :class="sortDir === 'asc'
                ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)] text-[var(--pb-text)]'
                : 'border-[var(--pb-divider)] text-[var(--pb-text-muted)] hover:border-[var(--pb-border-strong)] hover:text-[var(--pb-text)]'"
              @click="emitSort('asc')"
            >
              <UIcon name="i-lucide-arrow-up" class="size-3.5" />
              {{ t('admin.posts.columnFilter.sortAsc') }}
            </button>
            <button
              type="button"
              class="inline-flex items-center justify-center gap-1.5 rounded-[var(--pb-radius-sm)] border px-2 py-1.5 text-xs font-medium transition"
              :class="sortDir === 'desc'
                ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)] text-[var(--pb-text)]'
                : 'border-[var(--pb-divider)] text-[var(--pb-text-muted)] hover:border-[var(--pb-border-strong)] hover:text-[var(--pb-text)]'"
              @click="emitSort('desc')"
            >
              <UIcon name="i-lucide-arrow-down" class="size-3.5" />
              {{ t('admin.posts.columnFilter.sortDesc') }}
            </button>
          </div>
        </div>

        <div v-if="sortable && hasFilterSlot" class="h-px bg-[var(--pb-divider)]" />

        <slot />

        <div v-if="active" class="flex justify-end border-t border-[var(--pb-divider)] pt-2">
          <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" @click="$emit('clear')">
            {{ t('admin.common.clear') }}
          </UButton>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
type SortDir = 'asc' | 'desc'

const props = withDefaults(defineProps<{
  label: string
  sortable?: boolean
  sortDir?: SortDir | null
  active?: boolean
  align?: 'start' | 'center' | 'end'
  width?: number
}>(), {
  sortable: false,
  sortDir: null,
  active: false,
  align: 'start',
  width: 256
})

const emit = defineEmits<{
  sort: [dir: SortDir]
  clear: []
}>()

const { t } = useI18n()
const slots = useSlots()
const hasFilterSlot = computed(() => Boolean(slots.default))
const highlighted = computed(() => props.active || Boolean(props.sortDir))

function emitSort(dir: SortDir) {
  emit('sort', dir)
}
</script>
