<template>
  <div class="flex flex-wrap items-center gap-1">
    <span
      v-for="tag in modelValue"
      :key="tag"
      class="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800"
    >
      {{ tag }}
      <button type="button" class="ml-0.5 hover:text-teal-950" @click="removeTag(tag)">
        <UIcon name="i-lucide-x" class="size-3" />
      </button>
    </span>
    <div class="relative min-w-[120px] flex-1">
      <input
        ref="inputRef"
        v-model="inputValue"
        type="text"
        class="w-full border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-stone-400"
        :placeholder="t('admin.media.addTagPlaceholder')"
        @keydown.enter.prevent="confirmTag"
        @keydown.tab.prevent="confirmTag"
        @keydown.backspace="handleBackspace"
        @input="fetchSuggestions"
        @focus="showDropdown = true"
        @blur="handleBlur"
      >
      <ul
        v-if="showDropdown && suggestions.length > 0"
        class="absolute left-0 top-full z-[80] mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-stone-200 bg-white py-1 shadow-lg"
      >
        <li
          v-for="suggestion in suggestions"
          :key="suggestion"
          class="cursor-pointer px-3 py-1 text-sm text-stone-700 hover:bg-teal-50 hover:text-teal-800"
          @mousedown.prevent="selectSuggestion(suggestion)"
        >
          {{ suggestion }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: string[]
}>()

const { t } = useI18n()
const emit = defineEmits<{
  'update:modelValue': [tags: string[]]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const inputValue = ref('')
const suggestions = ref<string[]>([])
const showDropdown = ref(false)
const allTags = ref<string[]>([])
let fetchedTags = false

async function loadAllTags() {
  if (fetchedTags) return
  try {
    fetchedTags = true
    const data = await $fetch<{ tags: { id: string; name: string }[] }>('/api/media/tags')
    allTags.value = data.tags.map((t) => t.name)
  } catch {
    // Allow retry on next input/focus if request failed.
    fetchedTags = false
  }
}

function fetchSuggestions() {
  void loadAllTags()
  const query = inputValue.value.trim().toLowerCase()
  if (!query) {
    suggestions.value = []
    return
  }
  suggestions.value = allTags.value
    .filter((tag) => tag.toLowerCase().includes(query) && !props.modelValue.includes(tag))
    .slice(0, 10)
}

function confirmTag() {
  const tag = inputValue.value.trim()
  if (tag && !props.modelValue.includes(tag)) {
    emit('update:modelValue', [...props.modelValue, tag])
  }
  inputValue.value = ''
  suggestions.value = []
}

function selectSuggestion(tag: string) {
  if (!props.modelValue.includes(tag)) {
    emit('update:modelValue', [...props.modelValue, tag])
  }
  inputValue.value = ''
  suggestions.value = []
  showDropdown.value = false
}

function removeTag(tag: string) {
  emit('update:modelValue', props.modelValue.filter((t) => t !== tag))
}

function handleBackspace() {
  if (!inputValue.value && props.modelValue.length > 0) {
    emit('update:modelValue', props.modelValue.slice(0, -1))
  }
}

function handleBlur() {
  setTimeout(() => { showDropdown.value = false }, 150)
}
</script>
