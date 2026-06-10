<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" class="absolute inset-0 bg-black/40" :aria-label="t('admin.common.close')" @click="emit('close')" />
      <section class="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
        <header class="flex items-center justify-between border-b border-stone-200 p-4">
          <h2 class="text-lg font-semibold text-stone-950">{{ t('admin.media.searchMedia') }}</h2>
          <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" @click="emit('close')" />
        </header>

        <div class="border-b border-stone-200 px-4 pt-3">
          <div class="flex flex-wrap gap-1 rounded-md bg-stone-100 p-1">
            <button
              v-for="tab in tabs"
              :key="tab.value"
              type="button"
              class="rounded px-3 py-1.5 text-sm font-medium transition"
              :class="activeTab === tab.value ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-600 hover:text-stone-950'"
              @click="activeTab = tab.value"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <section v-if="activeTab === 'simple'" class="space-y-4">
            <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <UFormField :label="t('admin.media.fileName')">
                <UInput v-model="form.file_name" icon="i-lucide-file-search" placeholder="holiday|report" />
              </UFormField>
              <UFormField :label="t('admin.media.fileExtension')">
                <UInput v-model="form.extension" icon="i-lucide-file-type" placeholder="pdf" />
              </UFormField>
              <UFormField :label="t('admin.media.comments')">
                <UInput v-model="form.comment" icon="i-lucide-message-square" placeholder="draft" />
              </UFormField>
              <UFormField :label="t('admin.media.tags')">
                <div class="rounded-md border border-stone-300 px-2 py-1.5">
                  <MediaTagInput v-model="form.tags" />
                </div>
              </UFormField>
              <UFormField :label="t('admin.media.from')">
                <UInput v-model="form.uploaded_from" type="date" />
              </UFormField>
              <UFormField :label="t('admin.media.to')">
                <UInput v-model="form.uploaded_to" type="date" />
              </UFormField>
              <UFormField :label="t('admin.media.type')">
                <USelect v-model="form.type" :items="typeItems" :content="selectContent" :ui="selectUi" />
              </UFormField>
            </div>

            <div class="flex flex-wrap gap-4 rounded-lg border border-stone-200 p-3">
              <label class="flex items-center gap-2 text-sm text-stone-700">
                <input v-model="form.search_regex" type="checkbox" class="rounded border-stone-300">
                <span>{{ t('admin.media.regex') }}</span>
              </label>
              <label class="flex items-center gap-2 text-sm text-stone-700">
                <input v-model="form.case_insensitive" type="checkbox" class="rounded border-stone-300">
                <span>{{ t('admin.media.caseInsensitive') }}</span>
              </label>
              <label class="flex items-center gap-2 text-sm text-stone-700">
                <input v-model="form.orphan" type="checkbox" class="rounded border-stone-300">
                <span>{{ t('admin.media.orphanOnly') }}</span>
              </label>
            </div>
          </section>

          <section v-else-if="activeTab === 'advanced'" class="space-y-3 rounded-lg border border-stone-200 p-3">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-medium text-stone-900">{{ t('admin.media.advancedConditions') }}</h3>
              <div class="ml-auto w-32">
                <USelect v-model="form.rootOp" :items="opItems" :content="selectContent" :ui="selectUi" />
              </div>
              <UButton type="button" size="xs" icon="i-lucide-plus" color="neutral" variant="soft" @click="addCondition(form.conditions)">{{ t('admin.media.condition') }}</UButton>
              <UButton type="button" size="xs" icon="i-lucide-folder-plus" color="neutral" variant="soft" @click="addGroup">{{ t('admin.media.group') }}</UButton>
            </div>

            <div class="space-y-2">
              <div
                v-for="condition in form.conditions"
                :key="condition.id"
                class="grid gap-2 rounded-md bg-stone-50 p-2 md:grid-cols-[160px_140px_minmax(160px,1fr)_minmax(120px,1fr)_auto]"
              >
                <USelect v-model="condition.field" :items="fieldItems" :content="selectContent" :ui="selectUi" />
                <USelect v-model="condition.operator" :items="operatorItems" :content="selectContent" :ui="selectUi" />
                <UInput v-model="condition.value" :placeholder="t('admin.media.value')" />
                <UInput v-if="condition.operator === 'between'" v-model="condition.valueTo" :placeholder="t('admin.media.to')" />
                <label v-else class="flex items-center gap-2 text-xs text-stone-600">
                  <input v-model="condition.caseInsensitive" type="checkbox" class="rounded border-stone-300">
                  <span>{{ t('admin.media.caseInsensitive') }}</span>
                </label>
                <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" @click="removeCondition(form.conditions, condition.id)" />
              </div>
            </div>

            <div
              v-for="group in form.groups"
              :key="group.id"
              class="space-y-2 rounded-lg border border-stone-200 bg-white p-3"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-stone-700">{{ t('admin.media.group') }}</span>
                <div class="w-28">
                  <USelect v-model="group.op" :items="opItems" :content="selectContent" :ui="selectUi" />
                </div>
                <UButton type="button" size="xs" icon="i-lucide-plus" color="neutral" variant="soft" @click="addCondition(group.conditions)">{{ t('admin.media.condition') }}</UButton>
                <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" class="ml-auto" @click="removeGroup(group.id)" />
              </div>

              <div
                v-for="condition in group.conditions"
                :key="condition.id"
                class="grid gap-2 rounded-md bg-stone-50 p-2 md:grid-cols-[160px_140px_minmax(160px,1fr)_minmax(120px,1fr)_auto]"
              >
                <USelect v-model="condition.field" :items="fieldItems" :content="selectContent" :ui="selectUi" />
                <USelect v-model="condition.operator" :items="operatorItems" :content="selectContent" :ui="selectUi" />
                <UInput v-model="condition.value" :placeholder="t('admin.media.value')" />
                <UInput v-if="condition.operator === 'between'" v-model="condition.valueTo" :placeholder="t('admin.media.to')" />
                <label v-else class="flex items-center gap-2 text-xs text-stone-600">
                  <input v-model="condition.caseInsensitive" type="checkbox" class="rounded border-stone-300">
                  <span>{{ t('admin.media.caseInsensitive') }}</span>
                </label>
                <UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" @click="removeCondition(group.conditions, condition.id)" />
              </div>
            </div>
          </section>

          <section v-else-if="activeTab === 'favorites'" class="space-y-3">
            <div
              v-for="entry in favoriteSearches"
              :key="entry.id"
              class="flex flex-col gap-3 rounded-lg border border-stone-200 bg-white p-3 md:flex-row md:items-center"
            >
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-stone-950">{{ entry.name }}</div>
                <div class="mt-1 truncate text-xs text-stone-500">{{ savedSummary(entry.form) }}</div>
              </div>
              <div class="flex shrink-0 gap-2">
                <UButton type="button" size="xs" color="neutral" variant="soft" icon="i-lucide-pencil" @click="loadSavedSearch(entry)">{{ t('admin.media.load') }}</UButton>
                <UButton type="button" size="xs" icon="i-lucide-search" @click="applySavedSearch(entry)">{{ t('admin.media.search') }}</UButton>
                <UButton type="button" size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" @click="deleteFavorite(entry.id)" />
              </div>
            </div>
            <div v-if="!favoriteSearches.length" class="rounded-lg border border-dashed border-stone-300 py-10 text-center text-sm text-stone-500">{{ t('admin.media.noFavoriteSearches') }}</div>
          </section>

          <section v-else class="space-y-3">
            <div
              v-for="entry in recentSearches"
              :key="entry.id"
              class="flex flex-col gap-3 rounded-lg border border-stone-200 bg-white p-3 md:flex-row md:items-center"
            >
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-stone-950">{{ entry.name }}</div>
                <div class="mt-1 truncate text-xs text-stone-500">{{ savedSummary(entry.form) }}</div>
              </div>
              <div class="flex shrink-0 gap-2">
                <UButton type="button" size="xs" color="neutral" variant="soft" icon="i-lucide-pencil" @click="loadSavedSearch(entry)">{{ t('admin.media.load') }}</UButton>
                <UButton type="button" size="xs" icon="i-lucide-search" @click="applySavedSearch(entry)">{{ t('admin.media.search') }}</UButton>
                <UButton type="button" size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" @click="deleteRecent(entry.id)" />
              </div>
            </div>
            <div v-if="!recentSearches.length" class="rounded-lg border border-dashed border-stone-300 py-10 text-center text-sm text-stone-500">{{ t('admin.media.noRecentSearches') }}</div>
          </section>
        </div>

        <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-stone-200 p-4">
          <UButton type="button" icon="i-lucide-star" color="neutral" variant="soft" @click="openFavoriteDialog">{{ t('admin.media.saveFavorite') }}</UButton>
          <UButton type="button" color="neutral" variant="ghost" @click="resetForm">{{ t('admin.media.reset') }}</UButton>
          <UButton type="button" icon="i-lucide-search" @click="applySearch">{{ t('admin.media.search') }}</UButton>
        </footer>
      </section>

      <div v-if="favoriteDialogOpen" class="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <button type="button" class="absolute inset-0 bg-black/30" :aria-label="t('admin.common.close')" @click="favoriteDialogOpen = false" />
        <form class="relative w-full max-w-md rounded-lg bg-white p-4 shadow-xl" @submit.prevent="confirmSaveFavorite">
          <h3 class="text-base font-semibold text-stone-950">{{ t('admin.media.saveFavoriteSearch') }}</h3>
          <UFormField :label="t('admin.media.name')" class="mt-4">
            <UInput v-model="favoriteName" icon="i-lucide-star" autofocus />
          </UFormField>
          <div class="mt-4 flex justify-end gap-2">
            <UButton type="button" color="neutral" variant="ghost" @click="favoriteDialogOpen = false">{{ t('admin.media.cancel') }}</UButton>
            <UButton type="submit" icon="i-lucide-check">{{ t('admin.media.save') }}</UButton>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import MediaTagInput from '~/components/admin/media/MediaTagInput.vue'

type SearchTab = 'simple' | 'advanced' | 'favorites' | 'recent'

interface SearchCondition {
  id: string
  field: string
  operator: string
  value: string
  valueTo: string
  caseInsensitive: boolean
}

interface SearchGroup {
  id: string
  op: 'AND' | 'OR'
  conditions: SearchCondition[]
}

export interface MediaSearchPayload {
  search: string
  file_name: string
  extension: string
  comment: string
  tags: string[]
  type: string
  tag: string
  uploaded_from: string
  uploaded_to: string
  orphan: boolean
  search_regex: boolean
  case_insensitive: boolean
  filename_regex: string
  filename_regex_case_insensitive: boolean
  advanced: unknown | null
}

interface SavedSearch {
  id: string
  name: string
  form: SearchForm
}

interface SearchForm {
  search: string
  file_name: string
  extension: string
  comment: string
  tags: string[]
  type: string
  uploaded_from: string
  uploaded_to: string
  orphan: boolean
  search_regex: boolean
  case_insensitive: boolean
  rootOp: 'AND' | 'OR'
  conditions: SearchCondition[]
  groups: SearchGroup[]
}

const props = defineProps<{
  modelValue: MediaSearchPayload
}>()

const emit = defineEmits<{
  close: []
  apply: [value: MediaSearchPayload]
}>()

const { t } = useI18n()

const recentKey = 'pandablog-media-recent-searches'
const favoriteKey = 'pandablog-media-favorite-searches'
const tabKey = 'pandablog-media-search-active-tab'
const activeTab = ref<SearchTab>('simple')
const favoriteDialogOpen = ref(false)
const favoriteName = ref('')
const recentSearches = ref<SavedSearch[]>(readSaved(recentKey))
const favoriteSearches = ref<SavedSearch[]>(readSaved(favoriteKey))
const form = reactive<SearchForm>(payloadToForm(props.modelValue))

if (typeof localStorage !== 'undefined') {
  const savedTab = localStorage.getItem(tabKey)
  if (savedTab === 'simple' || savedTab === 'advanced' || savedTab === 'favorites' || savedTab === 'recent') {
    activeTab.value = savedTab
  }
}

watch(activeTab, (value) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(tabKey, value)
  }
})

const tabs = computed<Array<{ label: string; value: SearchTab }>>(() => [
  { label: t('admin.media.simpleSearch'), value: 'simple' },
  { label: t('admin.media.advancedSearch'), value: 'advanced' },
  { label: t('admin.media.favoriteSearches'), value: 'favorites' },
  { label: t('admin.media.recentSearches'), value: 'recent' }
])

const selectContent = { side: 'bottom' as const, sideOffset: 6, collisionPadding: 16 }
const selectUi = { content: 'z-[80]' }

const typeItems = computed(() => [
  { label: t('admin.media.typeAll'), value: 'all' },
  { label: t('admin.media.typeImages'), value: 'image' },
  { label: t('admin.media.typeVideos'), value: 'video' },
  { label: t('admin.media.typeDocuments'), value: 'document' },
  { label: t('admin.media.typeArchives'), value: 'archive' },
  { label: t('admin.media.typeOther'), value: 'other' }
])

const opItems = [
  { label: 'AND', value: 'AND' },
  { label: 'OR', value: 'OR' }
]

const fieldItems = computed(() => [
  { label: t('admin.media.fieldFileName'), value: 'original_name' },
  { label: t('admin.media.fieldFileExtension'), value: 'extension' },
  { label: t('admin.media.fieldComments'), value: 'comment' },
  { label: t('admin.media.tags'), value: 'tags' },
  { label: t('admin.media.fieldFileType'), value: 'type' },
  { label: t('admin.media.mimeType'), value: 'mime_type' },
  { label: t('admin.media.uploadedDate'), value: 'uploaded_at' },
  { label: t('admin.media.orphan'), value: 'orphan' }
])

const operatorItems = computed(() => [
  { label: t('admin.media.contains'), value: 'contains' },
  { label: t('admin.media.equals'), value: 'equals' },
  { label: t('admin.media.regex'), value: 'regex' },
  { label: t('admin.media.before'), value: 'before' },
  { label: t('admin.media.after'), value: 'after' },
  { label: t('admin.media.between'), value: 'between' }
])

function payloadToForm(payload: Partial<MediaSearchPayload>): SearchForm {
  const parsedAdvanced = advancedToForm(payload.advanced)
  const tags = Array.isArray(payload.tags) && payload.tags.length
    ? payload.tags
    : payload.tag
      ? [payload.tag]
      : []

  return {
    search: payload.search || '',
    file_name: payload.file_name || '',
    extension: payload.extension || '',
    comment: payload.comment || '',
    tags,
    type: payload.type || 'all',
    uploaded_from: payload.uploaded_from || '',
    uploaded_to: payload.uploaded_to || '',
    orphan: payload.orphan || false,
    search_regex: payload.search_regex || false,
    case_insensitive: payload.case_insensitive !== false,
    rootOp: parsedAdvanced.rootOp,
    conditions: parsedAdvanced.conditions,
    groups: parsedAdvanced.groups
  }
}

function advancedToForm(value: unknown): Pick<SearchForm, 'rootOp' | 'conditions' | 'groups'> {
  const group = value && typeof value === 'object' ? value as { op?: unknown; conditions?: unknown } : null
  const conditions = Array.isArray(group?.conditions) ? group.conditions : []
  const rootConditions: SearchCondition[] = []
  const groups: SearchGroup[] = []

  for (const condition of conditions) {
    if (condition && typeof condition === 'object' && Array.isArray((condition as { conditions?: unknown }).conditions)) {
      const nested = condition as { op?: unknown; conditions?: unknown[] }
      const nestedConditions = Array.isArray(nested.conditions) ? nested.conditions.map(conditionFromPayload).filter(isDefined) : []
      if (nestedConditions.length) {
        groups.push({
          id: uid(),
          op: nested.op === 'OR' ? 'OR' : 'AND',
          conditions: nestedConditions
        })
      }
    } else {
      const parsed = conditionFromPayload(condition)
      if (parsed) rootConditions.push(parsed)
    }
  }

  return {
    rootOp: group?.op === 'OR' ? 'OR' : 'AND',
    conditions: rootConditions,
    groups
  }
}

function conditionFromPayload(value: unknown): SearchCondition | null {
  if (!value || typeof value !== 'object') return null
  const condition = value as Partial<SearchCondition>
  return {
    id: condition.id || uid(),
    field: condition.field || 'original_name',
    operator: condition.operator || 'contains',
    value: condition.value || '',
    valueTo: condition.valueTo || '',
    caseInsensitive: condition.caseInsensitive !== false
  }
}

function addCondition(target: SearchCondition[]) {
  target.push({
    id: uid(),
    field: 'original_name',
    operator: 'contains',
    value: '',
    valueTo: '',
    caseInsensitive: true
  })
}

function removeCondition(target: SearchCondition[], id: string) {
  const index = target.findIndex((condition) => condition.id === id)
  if (index !== -1) target.splice(index, 1)
}

function addGroup() {
  form.groups.push({
    id: uid(),
    op: 'AND',
    conditions: [{ id: uid(), field: 'original_name', operator: 'contains', value: '', valueTo: '', caseInsensitive: true }]
  })
}

function removeGroup(id: string) {
  const index = form.groups.findIndex((group) => group.id === id)
  if (index !== -1) form.groups.splice(index, 1)
}

function applySearch() {
  const payload = formToPayload()
  addRecent(payload)
  emit('apply', payload)
}

function formToPayload(): MediaSearchPayload {
  return payloadFromForm(form)
}

function payloadFromForm(value: SearchForm): MediaSearchPayload {
  const advancedConditions = [
    ...value.conditions.map(conditionToPayload).filter(isDefined),
    ...value.groups
      .map((group) => ({
        op: group.op,
        conditions: group.conditions.map(conditionToPayload).filter(isDefined)
      }))
      .filter((group) => group.conditions.length)
  ]

  return {
    search: '',
    file_name: value.file_name.trim(),
    extension: value.extension.trim(),
    comment: value.comment.trim(),
    tags: [...value.tags],
    type: value.type,
    tag: value.tags[0] || '',
    uploaded_from: value.uploaded_from,
    uploaded_to: value.uploaded_to,
    orphan: value.orphan,
    search_regex: value.search_regex,
    case_insensitive: value.case_insensitive,
    filename_regex: '',
    filename_regex_case_insensitive: value.case_insensitive,
    advanced: advancedConditions.length ? { op: value.rootOp, conditions: advancedConditions } : null
  }
}

function conditionToPayload(condition: SearchCondition) {
  if (!condition.value && condition.field !== 'orphan') return null
  return {
    field: condition.field,
    operator: condition.operator,
    value: condition.field === 'orphan' ? (condition.value || 'true') : condition.value,
    valueTo: condition.valueTo,
    caseInsensitive: condition.caseInsensitive
  }
}

function openFavoriteDialog() {
  favoriteName.value = searchLabel(formToPayload())
  favoriteDialogOpen.value = true
}

function confirmSaveFavorite() {
  const name = favoriteName.value.trim()
  if (!name) return
  const entry = makeSavedSearch(name, formToPayload())
  favoriteSearches.value = [entry, ...favoriteSearches.value.filter((item) => item.name !== name)].slice(0, 20)
  writeSaved(favoriteKey, favoriteSearches.value)
  favoriteDialogOpen.value = false
  activeTab.value = 'favorites'
}

function addRecent(payload: MediaSearchPayload) {
  const key = payloadKey(payload)
  const entry = makeSavedSearch(searchLabel(payload), payload)
  recentSearches.value = [entry, ...recentSearches.value.filter((item) => payloadKey(payloadFromForm(item.form)) !== key)].slice(0, 10)
  writeSaved(recentKey, recentSearches.value)
}

function loadSavedSearch(entry: SavedSearch) {
  Object.assign(form, cloneForm(entry.form))
  activeTab.value = 'simple'
}

function applySavedSearch(entry: SavedSearch) {
  Object.assign(form, cloneForm(entry.form))
  applySearch()
}

function deleteFavorite(id: string) {
  favoriteSearches.value = favoriteSearches.value.filter((entry) => entry.id !== id)
  writeSaved(favoriteKey, favoriteSearches.value)
}

function deleteRecent(id: string) {
  recentSearches.value = recentSearches.value.filter((entry) => entry.id !== id)
  writeSaved(recentKey, recentSearches.value)
}

function resetForm() {
  Object.assign(form, payloadToForm(defaultPayload()))
  activeTab.value = 'simple'
}

function makeSavedSearch(name: string, payload: MediaSearchPayload): SavedSearch {
  return { id: uid(), name, form: payloadToForm(payload) }
}

function searchLabel(payload: MediaSearchPayload) {
  return payload.file_name || payload.extension || payload.comment || payload.tags[0] || payload.type || t('admin.media.mediaSearchDefault')
}

function savedSummary(savedForm: SearchForm) {
  const parts = [
    savedForm.file_name ? t('admin.media.summaryName', { value: savedForm.file_name }) : '',
    savedForm.extension ? t('admin.media.summaryExtension', { value: savedForm.extension }) : '',
    savedForm.comment ? t('admin.media.summaryComments', { value: savedForm.comment }) : '',
    savedForm.tags.length ? t('admin.media.summaryTags', { value: savedForm.tags.join(', ') }) : '',
    savedForm.uploaded_from ? t('admin.media.summaryFrom', { value: savedForm.uploaded_from }) : '',
    savedForm.uploaded_to ? t('admin.media.summaryTo', { value: savedForm.uploaded_to }) : '',
    savedForm.type && savedForm.type !== 'all' ? t('admin.media.summaryType', { value: savedForm.type }) : '',
    savedForm.conditions.length || savedForm.groups.length ? t('admin.media.advancedSummary', { op: savedForm.rootOp }) : '',
    savedForm.search_regex ? t('admin.media.regex') : ''
  ].filter(Boolean)

  return parts.join(' | ') || t('admin.media.allMedia')
}

function payloadKey(payload: MediaSearchPayload) {
  return JSON.stringify(payload)
}

function defaultPayload(): MediaSearchPayload {
  return {
    search: '',
    file_name: '',
    extension: '',
    comment: '',
    tags: [],
    type: 'all',
    tag: '',
    uploaded_from: '',
    uploaded_to: '',
    orphan: false,
    search_regex: false,
    case_insensitive: true,
    filename_regex: '',
    filename_regex_case_insensitive: true,
    advanced: null
  }
}

function readSaved(key: string): SavedSearch[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]') as Array<Partial<SavedSearch>>
    return Array.isArray(parsed)
      ? parsed
        .filter((entry) => entry && typeof entry.name === 'string' && entry.form)
        .map((entry) => ({
          id: typeof entry.id === 'string' ? entry.id : uid(),
          name: entry.name || t('admin.media.mediaSearchDefault'),
          form: normalizeForm(entry.form as Partial<SearchForm>)
        }))
      : []
  } catch {
    return []
  }
}

function writeSaved(key: string, value: SavedSearch[]) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

function normalizeForm(value: Partial<SearchForm>): SearchForm {
  const base = payloadToForm(defaultPayload())
  const normalizedGroups: SearchGroup[] = Array.isArray(value.groups)
    ? value.groups
      .map((group) => {
        const op: 'AND' | 'OR' = group.op === 'OR' ? 'OR' : 'AND'
        return {
          id: group.id || uid(),
          op,
          conditions: Array.isArray(group.conditions) ? group.conditions.map(conditionFromPayload).filter(isDefined) : []
        }
      })
      .filter((group) => group.conditions.length)
    : []

  return {
    ...base,
    ...value,
    tags: Array.isArray(value.tags) ? value.tags : [],
    case_insensitive: value.case_insensitive !== false,
    rootOp: value.rootOp === 'OR' ? 'OR' : 'AND',
    conditions: Array.isArray(value.conditions) ? value.conditions.map(conditionFromPayload).filter(isDefined) : [],
    groups: normalizedGroups
  }
}

function cloneForm(value: SearchForm): SearchForm {
  return JSON.parse(JSON.stringify(value)) as SearchForm
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
</script>
