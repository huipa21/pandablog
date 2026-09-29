<template>
  <UPopover
    v-model:open="open"
    :reference="reference ?? undefined"
    :content="{ side: 'bottom', align, sideOffset: 8, collisionPadding: 12 }"
    :ui="{ content: 'bg-transparent p-0 shadow-none ring-0' }"
  >
    <button
      type="button"
      class="search-advanced-toggle"
      :class="{ 'is-active': active, 'is-open': open }"
      :aria-label="t('public.search.advanced.toggle')"
      :title="t('public.search.advanced.toggle')"
      :aria-expanded="open"
      data-testid="search-advanced-toggle"
    >
      <UIcon name="i-lucide-chevron-down" class="search-advanced-toggle-icon size-4" />
      <span v-if="active" class="search-advanced-toggle-dot" aria-hidden="true" />
    </button>

    <template #content>
      <SearchAdvancedPanel :criteria="criteria" @submit="onSubmit" />
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import type { AdvancedSearchCriteria } from '~/utils/searchQuery'

withDefaults(defineProps<{
  /** Element the dropdown is positioned against (the whole search bar). */
  reference?: HTMLElement | null
  criteria: AdvancedSearchCriteria
  /** Advanced criteria are currently applied. */
  active?: boolean
  align?: 'start' | 'center' | 'end'
}>(), {
  reference: null,
  active: false,
  align: 'center'
})

const emit = defineEmits<{
  submit: [criteria: AdvancedSearchCriteria]
}>()

const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()

function onSubmit(criteria: AdvancedSearchCriteria) {
  open.value = false
  emit('submit', criteria)
}
</script>

<style scoped>
.search-advanced-toggle {
  position: relative;
  display: grid;
  height: 2rem;
  width: 2rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--pb-radius-sm);
  background: transparent;
  color: var(--pb-text-subtle);
  transition: background var(--pb-transition-default), color var(--pb-transition-default);
}

.search-advanced-toggle:hover,
.search-advanced-toggle.is-open {
  background: color-mix(in srgb, var(--pb-surface) 50%, transparent);
  color: var(--pb-link);
}

.search-advanced-toggle.is-active {
  color: var(--pb-primary);
}

.search-advanced-toggle-icon {
  transition: transform var(--pb-transition-default);
}

.search-advanced-toggle.is-open .search-advanced-toggle-icon {
  transform: rotate(180deg);
}

.search-advanced-toggle-dot {
  position: absolute;
  top: 0.3rem;
  right: 0.3rem;
  height: 0.375rem;
  width: 0.375rem;
  border-radius: 9999px;
  background: var(--pb-primary);
}
</style>
