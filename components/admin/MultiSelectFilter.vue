<template>
  <div ref="root" class="relative" @keydown.esc="open = false">
    <UButton
      type="button"
      color="neutral"
      variant="soft"
      :icon="icon"
      trailing-icon="i-lucide-chevron-down"
      class="min-w-40 justify-between"
      @click="open = !open"
    >
      {{ buttonText }}
    </UButton>

    <div
      v-if="open"
      class="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] shadow-[var(--pb-shadow-lg)]"
      @click.stop
    >
      <div class="flex items-center justify-between border-b border-[var(--pb-divider)] px-3 py-2">
        <span class="text-xs font-semibold uppercase tracking-wide text-[var(--pb-text-subtle)]">{{ label }}</span>
        <UButton size="xs" variant="ghost" color="neutral" :disabled="!modelValue.length" @click="clearSelection">
          Clear
        </UButton>
      </div>
      <div class="max-h-72 overflow-y-auto p-2">
        <label
          v-for="item in items"
          :key="item.id"
          class="flex cursor-pointer items-center gap-2 rounded-[var(--pb-radius-sm)] px-2 py-1.5 text-sm text-[var(--pb-text-muted)] hover:bg-[var(--pb-selected-bg)] hover:text-[var(--pb-text)]"
          :class="item.disabled ? 'cursor-not-allowed opacity-50' : ''"
          :style="{ paddingLeft: `${0.5 + (item.level ?? 0) * 1}rem` }"
        >
          <input
            type="checkbox"
            class="rounded border-[var(--pb-border-strong)]"
            :checked="selectedSet.has(item.id)"
            :disabled="item.disabled"
            @change="toggleItem(item.id, $event)"
          >
          <span class="truncate">{{ item.label ?? item.name }}</span>
        </label>
        <p v-if="!items.length" class="px-2 py-3 text-sm text-[var(--pb-text-subtle)]">No options</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface FilterItem {
  id: string
  name?: string
  label?: string
  level?: number
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue?: string[]
  items?: FilterItem[]
  label: string
  placeholder?: string
  icon?: string
}>(), {
  modelValue: () => [],
  items: () => [],
  placeholder: '',
  icon: 'i-lucide-list-filter'
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const selectedSet = computed(() => new Set(props.modelValue))
const buttonText = computed(() => props.modelValue.length
  ? `${props.label}: ${props.modelValue.length}`
  : props.placeholder || props.label)

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})

function handleDocumentClick(event: MouseEvent) {
  if (!root.value?.contains(event.target as Node)) {
    open.value = false
  }
}

function toggleItem(id: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  const next = new Set(props.modelValue)

  if (checked) {
    next.add(id)
  } else {
    next.delete(id)
  }

  emit('update:modelValue', Array.from(next))
}

function clearSelection() {
  emit('update:modelValue', [])
}
</script>