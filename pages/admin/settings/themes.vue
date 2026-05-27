<template>
  <div class="space-y-6">
    <header>
      <h1 class="text-2xl font-semibold">Themes</h1>
      <p class="text-gray-500">Upload, preview, and activate themes for the public blog.</p>
    </header>

    <!-- Upload -->
    <section class="border rounded-lg p-4">
      <h2 class="font-medium mb-2">Upload theme</h2>
      <form @submit.prevent="onUpload" class="flex items-center gap-3">
        <input ref="fileInput" type="file" accept=".zip" class="border rounded px-2 py-1" />
        <button
          type="submit"
          class="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50"
          :disabled="uploading"
        >
          {{ uploading ? 'Uploading…' : 'Upload .zip' }}
        </button>
      </form>
      <p v-if="uploadError" class="text-red-600 text-sm mt-2">{{ uploadError }}</p>
      <p v-if="uploadSuccess" class="text-green-600 text-sm mt-2">{{ uploadSuccess }}</p>
    </section>

    <!-- Theme list -->
    <section>
      <h2 class="font-medium mb-3">Installed themes</h2>
      <div v-if="pending">Loading…</div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <article
          v-for="theme in data?.themes ?? []"
          :key="theme.id"
          class="border rounded-lg overflow-hidden flex flex-col"
          :class="{ 'ring-2 ring-blue-500': theme.id === data?.activeId }"
        >
          <div class="aspect-[16/9] bg-gray-100">
            <img
              :src="`/themes/${theme.id}/${theme.preview}`"
              :alt="`${theme.name} preview`"
              class="w-full h-full object-cover"
              @error="(e: any) => (e.target.style.display = 'none')"
            />
          </div>
          <div class="p-3 flex-1 flex flex-col gap-2">
            <div>
              <h3 class="font-medium">{{ theme.name }}</h3>
              <p class="text-sm text-gray-500">v{{ theme.version }} · {{ theme.author }}</p>
              <p class="text-sm">{{ theme.description }}</p>
            </div>
            <div class="mt-auto flex gap-2 pt-2">
              <button
                class="text-sm px-2 py-1 border rounded"
                @click="openPreview(theme.id)"
              >Preview</button>
              <button
                class="text-sm px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
                :disabled="theme.id === data?.activeId"
                @click="activate(theme.id)"
              >
                {{ theme.id === data?.activeId ? 'Active' : 'Activate' }}
              </button>
              <button
                v-if="theme.id !== 'default' && theme.id !== data?.activeId"
                class="text-sm px-2 py-1 border border-red-300 text-red-600 rounded"
                @click="requestRemove(theme.id)"
              >Delete</button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <AdminConfirmActionDialog
      :open="deleteDialogOpen"
      title="Delete theme?"
      :description="deleteDialogDescription"
      confirm-label="Delete"
      confirm-color="error"
      :loading="deleting"
      @update:open="(value) => { if (!value) closeDeleteDialog() }"
      @cancel="closeDeleteDialog"
      @confirm="confirmRemove"
    />

    <!-- Preview modal -->
    <div
      v-if="previewId"
      class="fixed inset-0 bg-black/60 z-50 flex flex-col"
      @click.self="previewId = null"
    >
      <div class="bg-white p-2 flex items-center justify-between">
        <span class="font-medium px-2">Preview: {{ previewId }}</span>
        <div class="flex gap-2">
          <button
            class="px-3 py-1 bg-blue-600 text-white rounded"
            @click="activate(previewId); previewId = null"
          >Publish this theme</button>
          <button class="px-3 py-1 border rounded" @click="previewId = null">Close</button>
        </div>
      </div>
      <iframe
        :src="`/?theme=${previewId}`"
        class="flex-1 bg-white"
        sandbox="allow-same-origin allow-scripts"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { data, pending, refresh } = await useFetch('/api/admin/themes')

const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)
const uploadError = ref('')
const uploadSuccess = ref('')
const deleting = ref(false)

const previewId = ref<string | null>(null)
const deleteDialogOpen = ref(false)
const pendingDeleteThemeId = ref<string | null>(null)
const deleteDialogDescription = computed(() => pendingDeleteThemeId.value
  ? `Delete theme "${pendingDeleteThemeId.value}"?`
  : 'Delete this theme?')

async function onUpload() {
  uploadError.value = ''
  uploadSuccess.value = ''
  const file = fileInput.value?.files?.[0]
  if (!file) {
    uploadError.value = 'Pick a .zip file'
    return
  }

  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('theme', file)
    const res = await $fetch<{ ok: boolean, themeId: string }>('/api/admin/themes/upload', {
      method: 'POST',
      body: formData
    })
    uploadSuccess.value = `Installed: ${res.themeId}`
    if (fileInput.value) fileInput.value.value = ''
    await refresh()
  } catch (err: any) {
    uploadError.value = err.statusMessage ?? err.message ?? 'Upload failed'
  } finally {
    uploading.value = false
  }
}

async function activate(themeId: string) {
  await $fetch('/api/admin/themes/activate', { method: 'POST', body: { themeId } })
  await refresh()
}

function requestRemove(themeId: string) {
  pendingDeleteThemeId.value = themeId
  deleteDialogOpen.value = true
}

function closeDeleteDialog() {
  if (deleting.value) {
    return
  }

  deleteDialogOpen.value = false
  pendingDeleteThemeId.value = null
}

async function confirmRemove() {
  const themeId = pendingDeleteThemeId.value
  if (!themeId) {
    closeDeleteDialog()
    return
  }

  deleting.value = true
  try {
    await $fetch(`/api/admin/themes/${themeId}`, { method: 'DELETE' })
    await refresh()
    closeDeleteDialog()
  } catch (err: any) {
    uploadError.value = err?.statusMessage ?? err?.message ?? 'Delete failed'
  } finally {
    deleting.value = false
  }
}

function openPreview(themeId: string) {
  previewId.value = themeId
}
</script>
