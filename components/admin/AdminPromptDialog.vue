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
      <section class="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl">
        <h2 :id="titleId" class="text-lg font-semibold text-stone-950">
          {{ title }}
        </h2>
        <p v-if="description" class="mt-2 text-sm leading-relaxed text-stone-600">
          {{ description }}
        </p>

        <form class="mt-5 space-y-4" novalidate @submit.prevent="handleSubmit">
          <UFormField :label="label" :error="errorMessage || undefined">
            <UTextarea
              v-if="multiline"
              v-model="value"
              :rows="rows"
              :placeholder="placeholder"
              :disabled="loading"
              class="w-full"
            />
            <UInput
              v-else
              v-model="value"
              :type="inputType"
              :placeholder="placeholder"
              :disabled="loading"
              class="w-full"
            />
          </UFormField>

          <div class="flex flex-wrap justify-end gap-2 pt-2">
            <UButton type="button" color="neutral" variant="ghost" :disabled="loading" @click="handleCancel">
              {{ cancelLabel }}
            </UButton>
            <UButton type="submit" :loading="loading" :disabled="!canSubmit">
              {{ confirmLabel }}
            </UButton>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  label: string
  description?: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  cancelLabel?: string
  multiline?: boolean
  rows?: number
  inputType?: 'text' | 'password' | 'url'
  required?: boolean
  trim?: boolean
  loading?: boolean
  validate?: (value: string) => string | null
}>(), {
  description: '',
  placeholder: '',
  initialValue: '',
  confirmLabel: 'Save',
  cancelLabel: 'Cancel',
  multiline: false,
  rows: 4,
  inputType: 'text',
  required: true,
  trim: true,
  loading: false,
  validate: undefined
})

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'cancel'): void
  (event: 'confirm', value: string): void
}>()

const titleId = useId()
const value = ref(props.initialValue)
const errorMessage = ref('')

const canSubmit = computed(() => !props.loading && (!props.required || !!value.value.trim()))

watch(() => props.open, (open) => {
  if (!open) {
    return
  }

  value.value = props.initialValue
  errorMessage.value = ''
})

watch(value, () => {
  errorMessage.value = ''
})

function handleCancel() {
  if (props.loading) {
    return
  }

  emit('update:open', false)
  emit('cancel')
}

function handleSubmit() {
  const nextValue = props.trim ? value.value.trim() : value.value
  if (props.required && !value.value.trim()) {
    errorMessage.value = `${props.label} is required.`
    return
  }

  const validationError = props.validate?.(nextValue)
  if (validationError) {
    errorMessage.value = validationError
    return
  }

  emit('confirm', nextValue)
}
</script>