<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-stone-900/45 p-4"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      @click.self="handleCancel"
    >
      <div class="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <UIcon name="i-lucide-triangle-alert" class="size-5" />
          </div>
          <div class="min-w-0 flex-1">
            <h2 :id="titleId" class="text-lg font-semibold text-stone-950">
              {{ title }}
            </h2>
            <p class="mt-2 text-sm leading-relaxed text-stone-600">
              {{ description }}
            </p>
            <p v-if="error" class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-relaxed text-red-950">
              {{ error }}
            </p>
          </div>
        </div>

        <div class="mt-6 flex flex-wrap justify-end gap-2">
          <UButton color="neutral" variant="soft" :disabled="loading" icon="i-lucide-x" @click="handleCancel">
            {{ cancelLabel }}
          </UButton>
          <UButton :color="confirmColor" :loading="loading" :icon="confirmIcon" @click="handleConfirm">
            {{ confirmLabel }}
          </UButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  confirmColor?: 'primary' | 'error' | 'warning' | 'neutral'
  loading?: boolean
  error?: string
}>(), {
  cancelLabel: 'Cancel',
  confirmColor: 'error',
  loading: false,
  error: ''
})

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'cancel'): void
  (event: 'confirm'): void
}>()

const titleId = useId()
const confirmIcon = computed(() => {
  if (props.confirmColor === 'error') {
    return 'i-lucide-trash-2'
  }

  if (props.confirmColor === 'warning') {
    return 'i-lucide-triangle-alert'
  }

  return 'i-lucide-check'
})

function handleCancel() {
  if (props.loading) {
    return
  }

  emit('update:open', false)
  emit('cancel')
}

function handleConfirm() {
  emit('confirm')
}
</script>