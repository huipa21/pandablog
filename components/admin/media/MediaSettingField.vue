<template>
  <div class="grid gap-2">
    <label class="text-sm font-medium text-stone-700">{{ label }}</label>
    <div v-if="previewSource" class="relative overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
      <img :src="previewSource" :alt="label" class="w-full object-cover" :class="previewClass || 'h-36'" :style="previewStyle">
      <button
        type="button"
        class="absolute right-2 top-2 rounded-full bg-white/90 p-1 shadow hover:bg-white"
        @click="emit('update:modelValue', '')"
      >
        <UIcon name="i-lucide-x" class="size-4 text-stone-700" />
      </button>
    </div>
    <div class="grid gap-2 md:grid-cols-[1fr_auto]">
      <UInput
        :model-value="modelValue"
        icon="i-lucide-link"
        :placeholder="placeholder || '/uploads/... or https://...'"
        @update:model-value="emit('update:modelValue', String($event ?? ''))"
      />
      <UButton type="button" icon="i-lucide-image-plus" variant="soft" @click="emit('browse')">
        Choose
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  label: string
  modelValue: string
  previewValue?: string
  placeholder?: string
  previewClass?: string
  previewStyle?: Record<string, string>
}>()

const previewSource = computed(() => props.previewValue || props.modelValue)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  browse: []
}>()
</script>
