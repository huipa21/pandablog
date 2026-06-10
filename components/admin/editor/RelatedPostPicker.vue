<template>
  <UModal v-model:open="open">
    <template #content>
      <UCard>
        <template #header>
          <div>
            <h3 class="text-base font-semibold text-stone-900">{{ t('admin.editor.relatedPost.title') }}</h3>
            <p class="text-xs text-stone-500">{{ t('admin.editor.relatedPost.description') }}</p>
          </div>
        </template>

        <div class="grid gap-3">
          <UInput
            v-model="query"
            :placeholder="t('admin.editor.relatedPost.placeholder')"
            icon="i-lucide-search"
            autofocus
            @input="onQueryInput"
          />

          <div v-if="loading" class="py-8 text-center text-sm text-stone-500">{{ t('admin.editor.relatedPost.searching') }}</div>
          <ul v-else-if="results.length" class="max-h-64 divide-y divide-stone-100 overflow-y-auto rounded border border-stone-200">
            <li v-for="item in results" :key="item.slug">
              <button
                type="button"
                class="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-stone-50"
                @click="confirm(item)"
              >
                <UIcon name="i-lucide-file-text" class="mt-0.5 size-4 text-stone-400" />
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium text-stone-900">{{ item.title }}</div>
                  <div class="truncate text-xs text-stone-500">/blog/{{ item.slug }}</div>
                </div>
              </button>
            </li>
          </ul>
          <div v-else-if="query.trim()" class="rounded border border-dashed border-stone-200 p-4 text-center text-sm text-stone-500">
            {{ t('admin.editor.relatedPost.noPosts') }}
          </div>
          <div v-else class="rounded border border-dashed border-stone-200 p-4 text-center text-sm text-stone-500">
            {{ t('admin.editor.relatedPost.startTyping') }}
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="close">{{ t('admin.editor.relatedPost.cancel') }}</UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface PostSuggestion {
  slug: string
  title: string
}

const props = defineProps<{
  modelValue: boolean
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm', value: { target: string, label: string }): void
}>()

const open = ref(props.modelValue)
const { t } = useI18n()
const query = ref('')
const loading = ref(false)
const results = ref<PostSuggestion[]>([])
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(() => props.modelValue, (next) => {
  open.value = next
  if (next) {
    query.value = ''
    results.value = []
  }
})

watch(open, (next) => emit('update:modelValue', next))

function onQueryInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { void runSearch() }, 200)
}

async function runSearch() {
  const q = query.value.trim()
  if (!q) {
    results.value = []
    return
  }

  loading.value = true
  try {
    const response = await $fetch<{ items: PostSuggestion[] }>('/api/admin/posts/search', {
      params: { q }
    })
    results.value = response.items ?? []
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
}

function confirm(item: PostSuggestion) {
  emit('confirm', { target: item.slug, label: item.title })
  close()
}

function close() {
  open.value = false
}
</script>
