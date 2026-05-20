<template>
  <div class="grid gap-3 rounded-lg border border-stone-200 bg-white p-3 lg:grid-cols-[minmax(220px,1fr)_160px_150px_150px_180px_auto] lg:items-end">
    <UFormField label="Search">
      <UInput v-model="local.search" icon="i-lucide-search" placeholder="Name or comment" @keydown.enter.prevent="submit" />
    </UFormField>
    <UFormField label="Type">
      <USelect v-model="local.type" :items="typeItems" />
    </UFormField>
    <UFormField label="From">
      <UInput v-model="local.uploaded_from" type="date" />
    </UFormField>
    <UFormField label="To">
      <UInput v-model="local.uploaded_to" type="date" />
    </UFormField>
    <UFormField label="Tag">
      <UInput v-model="local.tag" icon="i-lucide-tag" placeholder="Tag" @keydown.enter.prevent="submit" />
    </UFormField>
    <div class="flex gap-2">
      <UButton type="button" icon="i-lucide-search" @click="submit">Search</UButton>
      <UButton type="button" icon="i-lucide-rotate-ccw" color="neutral" variant="soft" @click="reset" />
    </div>
  </div>
</template>

<script setup lang="ts">
interface MediaSearchFilters {
  search: string
  type: string
  tag: string
  uploaded_from: string
  uploaded_to: string
}

const props = defineProps<{
  modelValue: MediaSearchFilters
}>()

const emit = defineEmits<{
  'update:modelValue': [value: MediaSearchFilters]
  'search': []
}>()

const local = reactive<MediaSearchFilters>({ ...props.modelValue })

const typeItems = [
  { label: 'All files', value: 'all' },
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' },
  { label: 'Documents', value: 'document' },
  { label: 'Archives', value: 'archive' },
  { label: 'Other', value: 'other' }
]

watch(() => props.modelValue, (value) => {
  Object.assign(local, value)
}, { deep: true })

watch(local, () => {
  emit('update:modelValue', { ...local })
}, { deep: true })

function submit() {
  emit('search')
}

function reset() {
  Object.assign(local, {
    search: '',
    type: 'all',
    tag: '',
    uploaded_from: '',
    uploaded_to: ''
  })
  emit('search')
}
</script>
