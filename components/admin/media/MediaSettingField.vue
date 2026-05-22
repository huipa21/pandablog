<template>
  <div class="grid gap-2">
    <label class="text-sm font-medium text-stone-700">{{ label }}</label>
    <div v-if="modelValue" class="relative overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
      <img :src="modelValue" :alt="label" class="h-36 w-full object-cover">
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
        placeholder="/uploads/... or https://..."
        @update:model-value="emit('update:modelValue', String($event ?? ''))"
      />
      <UButton type="button" icon="i-lucide-upload" variant="soft" :loading="loading" @click="emit('upload')">
        Upload
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  modelValue: string
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  upload: []
}>()
</script>
