<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Settings</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">Profile</h1>
      <p class="mt-2 max-w-2xl text-sm text-[var(--pb-text-muted)]">Configure the owner bio widget shown in the public sidebar.</p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load settings" />
    <UAlert v-if="saveError" color="error" icon="i-lucide-circle-alert" :title="saveError" />
    <UAlert v-if="securityError" color="error" icon="i-lucide-circle-alert" :title="securityError" />
    <UAlert v-if="notice" color="success" icon="i-lucide-check" :title="notice" />
    <UAlert v-if="securityNotice" color="success" icon="i-lucide-check" :title="securityNotice" />

    <form class="grid gap-5 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]" @submit.prevent="save">
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
          <div class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] bg-[var(--pb-card-bg)] p-3">
            <BlockEditor v-model="form.owner_bio" />
          </div>
        </UFormField>

        <div class="flex justify-end">
          <UButton type="submit" icon="i-lucide-save" :loading="saving">Save profile</UButton>
        </div>
      </template>
    </form>

    <form class="grid gap-5 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]" @submit.prevent="changePassword">
      <header>
        <h2 class="text-xl font-semibold tracking-normal text-[var(--pb-text)]">User Info</h2>
        <p class="mt-1 text-sm text-[var(--pb-text-muted)]">The admin username is fixed as admin. Change the password here when needed.</p>
      </header>

      <UFormField label="Current password" name="current_password">
        <UInput v-model="securityForm.current_password" type="password" autocomplete="current-password" icon="i-lucide-key-round" />
      </UFormField>

      <UFormField label="New password" name="new_password">
        <UInput v-model="securityForm.new_password" type="password" autocomplete="new-password" icon="i-lucide-key-round" />
      </UFormField>

      <UFormField label="Confirm new password" name="confirm_password">
        <UInput v-model="securityForm.confirm_password" type="password" autocomplete="new-password" icon="i-lucide-key-round" />
      </UFormField>

      <div class="flex justify-end">
        <UButton type="submit" icon="i-lucide-key-round" :loading="securitySaving">Change password</UButton>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import MediaSettingField from '~/components/admin/media/MediaSettingField.vue'
import BlockEditor from '~/components/admin/editor/blocks/BlockEditor.vue'
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
const securitySaving = ref(false)
const notice = ref('')
const saveError = ref('')
const securityNotice = ref('')
const securityError = ref('')

const securityForm = reactive({
  current_password: '',
  new_password: '',
  confirm_password: ''
})

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

async function changePassword() {
  securitySaving.value = true
  securityNotice.value = ''
  securityError.value = ''

  if (securityForm.new_password !== securityForm.confirm_password) {
    securityError.value = 'Passwords do not match'
    securitySaving.value = false
    return
  }

  try {
    await $fetch('/api/auth/change-password', {
      method: 'POST',
      body: { ...securityForm }
    })
    securityForm.current_password = ''
    securityForm.new_password = ''
    securityForm.confirm_password = ''
    securityNotice.value = 'Password changed'
  } catch (err: any) {
    securityError.value = err?.data?.message ?? err?.statusMessage ?? err?.message ?? 'Could not change password'
  } finally {
    securitySaving.value = false
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
