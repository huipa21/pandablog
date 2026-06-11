<template>
  <div class="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white p-3">
    <UFormField :label="t('admin.media.search')" class="min-w-[180px] flex-[2]">
      <UInput v-model="local.search" icon="i-lucide-search" :placeholder="t('admin.media.nameOrComment')" @keydown.enter.prevent="submit" />
    </UFormField>
    <UFormField :label="t('admin.media.type')" class="min-w-[130px] flex-1">
      <USelect v-model="local.type" :items="typeItems" />
    </UFormField>
    <UFormField :label="t('admin.media.from')" class="min-w-[140px] flex-1">
      <UInput v-model="local.uploaded_from" type="date" />
    </UFormField>
    <UFormField :label="t('admin.media.to')" class="min-w-[140px] flex-1">
      <UInput v-model="local.uploaded_to" type="date" />
    </UFormField>
    <UFormField :label="t('admin.media.tag')" class="min-w-[140px] flex-1">
      <div class="relative">
        <UInput
          v-model="local.tag"
          icon="i-lucide-tag"
          :placeholder="t('admin.media.tag')"
          @focus="handleTagFocus"
          @input="handleTagInput"
          @keydown.enter.prevent="submit"
          @blur="handleTagBlur"
        />
        <ul
          v-if="tagDropdownOpen && filteredTags.length"
          class="absolute z-[80] mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-stone-200 bg-white py-1 shadow-lg"
        >
          <li
            v-for="tag in filteredTags"
            :key="tag"
            class="cursor-pointer px-3 py-1.5 text-sm text-stone-700 hover:bg-teal-50 hover:text-teal-800"
            @mousedown.prevent="selectTag(tag)"
          >
            {{ tag }}
          </li>
        </ul>
      </div>
    </UFormField>
    <label class="flex items-center gap-2 pb-1 text-sm text-stone-700">
      <input v-model="local.orphan" type="checkbox" class="rounded border-stone-300">
      <span>{{ t('admin.media.orphanOnly') }}</span>
    </label>
    <label class="flex items-center gap-2 pb-1 text-sm text-stone-700">
      <input v-model="local.search_regex" type="checkbox" class="rounded border-stone-300">
      <span>{{ t('admin.media.regex') }}</span>
    </label>
    <label class="flex items-center gap-2 pb-1 text-sm text-stone-700">
      <input v-model="local.case_insensitive" type="checkbox" class="rounded border-stone-300">
      <span>{{ t('admin.media.caseInsensitive') }}</span>
    </label>
    <div class="flex gap-2">
      <UButton type="button" icon="i-lucide-search" @click="submit">{{ t('admin.media.search') }}</UButton>
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
  orphan: boolean
  search_regex: boolean
  case_insensitive: boolean
}

const props = defineProps<{
  modelValue: MediaSearchFilters
}>()

const emit = defineEmits<{
  'update:modelValue': [value: MediaSearchFilters]
  'search': []
}>()

const filterKeys = [
  'search',
  'type',
  'tag',
  'uploaded_from',
  'uploaded_to',
  'orphan',
  'search_regex',
  'case_insensitive'
] as const satisfies ReadonlyArray<keyof MediaSearchFilters>

const { t } = useI18n()
const local = reactive<MediaSearchFilters>({ ...props.modelValue })
const allTags = ref<string[]>([])
const tagDropdownOpen = ref(false)
const tagsLoaded = ref(false)

const filteredTags = computed(() => {
  const query = local.tag.trim().toLowerCase()
  if (!query) {
    return allTags.value.slice(0, 10)
  }

  return allTags.value
    .filter((tag) => tag.toLowerCase().includes(query))
    .slice(0, 10)
})

const typeItems = computed(() => [
  { label: t('admin.media.typeAll'), value: 'all' },
  { label: t('admin.media.typeImages'), value: 'image' },
  { label: t('admin.media.typeVideos'), value: 'video' },
  { label: t('admin.media.typeDocuments'), value: 'document' },
  { label: t('admin.media.typeArchives'), value: 'archive' },
  { label: t('admin.media.typeOther'), value: 'other' }
])

watch(() => filterSnapshot(props.modelValue), () => {
  if (!filtersEqual(local, props.modelValue)) {
    Object.assign(local, props.modelValue)
  }
})

watch(() => filterSnapshot(local), () => {
  const next = { ...local }
  if (!filtersEqual(next, props.modelValue)) {
    emit('update:modelValue', next)
  }
})

function filterSnapshot(value: MediaSearchFilters) {
  return filterKeys.map((key) => value[key])
}

function filtersEqual(left: MediaSearchFilters, right: MediaSearchFilters) {
  return filterKeys.every((key) => left[key] === right[key])
}

function submit() {
  emit('search')
}

async function loadTags() {
  if (tagsLoaded.value) return
  try {
    const data = await $fetch<{ tags: { id: string; name: string }[] }>('/api/media/tags')
    allTags.value = data.tags.map((tag) => tag.name)
    tagsLoaded.value = true
  } catch {
    tagsLoaded.value = false
  }
}

function handleTagInput() {
  void loadTags()
  tagDropdownOpen.value = true
}

function handleTagFocus() {
  void loadTags()
  tagDropdownOpen.value = true
}

function handleTagBlur() {
  setTimeout(() => {
    tagDropdownOpen.value = false
  }, 120)
}

function selectTag(tag: string) {
  local.tag = tag
  tagDropdownOpen.value = false
  submit()
}

function reset() {
  Object.assign(local, {
    search: '',
    type: 'all',
    tag: '',
    uploaded_from: '',
    uploaded_to: '',
    orphan: false,
    search_regex: false,
    case_insensitive: true
  })
  emit('search')
}
</script>
