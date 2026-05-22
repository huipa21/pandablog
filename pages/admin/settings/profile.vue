<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-teal-700">Settings</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-stone-950">Profile</h1>
      <p class="mt-2 max-w-2xl text-sm text-stone-600">Configure the owner bio widget shown in the public sidebar.</p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load settings" />
    <UAlert v-if="saveError" color="error" icon="i-lucide-circle-alert" :title="saveError" />
    <UAlert v-if="notice" color="success" icon="i-lucide-check" :title="notice" />

    <form class="grid gap-5 rounded-lg border border-stone-200 bg-white p-5 shadow-sm" @submit.prevent="save">
      <div v-if="pending" class="grid gap-4">
        <USkeleton class="h-10" />
        <USkeleton class="h-10" />
        <USkeleton class="h-80" />
      </div>

      <template v-else>
        <UFormField label="Display name" name="owner_name">
          <UInput v-model="form.owner_name" icon="i-lucide-user" />
        </UFormField>

        <UFormField label="Motto" name="owner_motto">
          <UInput v-model="form.owner_motto" icon="i-lucide-sparkles" />
        </UFormField>

        <MediaSettingField
          label="Avatar"
          :model-value="form.owner_avatar"
          :loading="uploadingAvatar"
          @update:model-value="form.owner_avatar = $event"
          @upload="avatarInput?.click()"
        />
        <input ref="avatarInput" type="file" accept="image/*" class="hidden" @change="uploadAvatar">

        <UFormField label="Bio" name="owner_bio">
          <TiptapEditor v-model="form.owner_bio" />
        </UFormField>

        <div class="flex justify-end">
          <UButton type="submit" icon="i-lucide-save" :loading="saving">Save profile</UButton>
        </div>
      </template>
    </form>
  </section>
</template>

<script setup lang="ts">
import MediaSettingField from '~/components/admin/media/MediaSettingField.vue'
import TiptapEditor from '~/components/admin/editor/TiptapEditor.vue'
import type { JsonContent } from '~/types/content'

definePageMeta({ layout: 'admin' })

const { data, pending, error } = await useAsyncData('admin-settings-profile', () => $fetch<{ settings: Record<string, unknown> }>('/api/admin/settings'))

const form = reactive({
  owner_name: '',
  owner_motto: '',
  owner_avatar: '',
  owner_bio: emptyDoc()
})
const avatarInput = ref<HTMLInputElement | null>(null)
const uploadingAvatar = ref(false)
const saving = ref(false)
const notice = ref('')
const saveError = ref('')

watch(data, (value) => {
  const settings = value?.settings ?? {}
  form.owner_name = textValue(settings.owner_name)
  form.owner_motto = textValue(settings.owner_motto)
  form.owner_avatar = textValue(settings.owner_avatar)
  form.owner_bio = jsonContentValue(settings.owner_bio) ?? emptyDoc()
}, { immediate: true })

async function save() {
  saving.value = true
  notice.value = ''
  saveError.value = ''

  try {
    await $fetch('/api/admin/settings', {
      method: 'POST',
      body: {
        owner_name: form.owner_name,
        owner_motto: form.owner_motto,
        owner_avatar: form.owner_avatar,
        owner_bio: form.owner_bio
      }
    })
    notice.value = 'Profile saved'
  } catch (err: any) {
    saveError.value = err?.statusMessage ?? err?.message ?? 'Could not save profile'
  } finally {
    saving.value = false
  }
}

async function uploadAvatar(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  uploadingAvatar.value = true
  saveError.value = ''
  try {
    const body = new FormData()
    body.append('file', file)
    const asset = await $fetch<{ url?: string }>('/api/admin/upload', {
      method: 'POST',
      body
    })
    if (asset.url) {
      form.owner_avatar = asset.url
    }
  } catch (err: any) {
    saveError.value = err?.statusMessage ?? err?.message ?? 'Upload failed'
  } finally {
    uploadingAvatar.value = false
  }
}

function emptyDoc(): JsonContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [] }]
  }
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function jsonContentValue(value: unknown): JsonContent | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const node = value as JsonContent
  return typeof node.type === 'string' ? node : null
}
</script>
