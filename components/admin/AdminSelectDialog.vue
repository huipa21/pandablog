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

        <form class="mt-5 space-y-4" @submit.prevent="handleSubmit">
          <UFormField :label="label" :error="errorMessage || undefined">
            <USelect
              v-model="value"
              :items="items"
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
interface SelectDialogItem {
  label: string
  value: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  label: string
  items: SelectDialogItem[]
  description?: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  required?: boolean
}>(), {
  description: '',
  placeholder: '',
  initialValue: '',
  confirmLabel: 'Save',
  cancelLabel: 'Cancel',
  loading: false,
  required: true
})

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'cancel'): void
  (event: 'confirm', value: string): void
}>()

const titleId = useId()
const value = ref(props.initialValue)
const errorMessage = ref('')

const canSubmit = computed(() => !props.loading && (!props.required || !!value.value))

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
  if (props.required && !value.value) {
    errorMessage.value = `${props.label} is required.`
    return
  }

  emit('confirm', value.value)
}
</script>