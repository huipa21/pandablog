<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Settings</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">Profile</h1>
      <p class="mt-2 max-w-2xl text-sm text-[var(--pb-text-muted)]">Configure the owner bio widget shown in the public sidebar.</p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load settings" />

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
          @update:model-value="form.owner_avatar = $event"
          @browse="mediaPickerOpen = true"
        />

        <fieldset class="rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-4">
          <legend class="px-1 text-sm font-medium text-[var(--pb-text-muted)]">Sidebar visibility</legend>
          <label class="flex cursor-pointer items-center justify-between gap-4 text-sm">
            <span class="grid gap-1">
              <span class="font-medium text-[var(--pb-text)]">Show this profile in the public site sidebar</span>
              <span class="text-xs text-[var(--pb-text-muted)]">Hide the owner bio card without deleting the saved profile content.</span>
            </span>
            <USwitch v-model="form.owner_bio_visible" />
          </label>
        </fieldset>

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

    <MediaPicker
      :open="mediaPickerOpen"
      return-value="url"
      type-filter="image"
      @update:open="mediaPickerOpen = $event"
      @select="handleAvatarPicked"
    />
  </section>
</template>

<script setup lang="ts">
import MediaPicker from '~/components/admin/media/MediaPicker.vue'
import MediaSettingField from '~/components/admin/media/MediaSettingField.vue'
import BlockEditor from '~/components/admin/editor/blocks/BlockEditor.vue'
import type { JsonContent } from '~/types/content'

definePageMeta({ layout: 'admin' })

const { data, pending, error } = await useAsyncData('admin-settings-profile', () => $fetch<{ settings: Record<string, unknown> }>('/api/admin/settings'))

const form = reactive({
  owner_name: '',
  owner_motto: '',
  owner_avatar: '',
  owner_bio_visible: true,
  owner_bio: emptyDoc()
})
const mediaPickerOpen = ref(false)
const saving = ref(false)
const securitySaving = ref(false)
const adminToast = useAdminToast()

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
  form.owner_bio_visible = settings.owner_bio_visible !== false
  form.owner_bio = jsonContentValue(settings.owner_bio) ?? emptyDoc()
}, { immediate: true })

async function save() {
  saving.value = true

  try {
    await $fetch('/api/admin/settings', {
      method: 'POST',
      body: {
        owner_name: form.owner_name,
        owner_motto: form.owner_motto,
        owner_avatar: form.owner_avatar,
        owner_bio_visible: form.owner_bio_visible,
        owner_bio: form.owner_bio
      }
    })
    adminToast.success('Profile saved')
  } catch (err: any) {
    adminToast.error(err, 'Could not save profile')
  } finally {
    saving.value = false
  }
}

function handleAvatarPicked(files: Array<{ url?: string }>) {
  const url = files[0]?.url
  if (url) {
    form.owner_avatar = url
  }
  mediaPickerOpen.value = false
}

async function changePassword() {
  securitySaving.value = true

  if (securityForm.new_password !== securityForm.confirm_password) {
    adminToast.error(new Error('Passwords do not match'), 'Passwords do not match')
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
    adminToast.success('Password changed.')
  } catch (err: any) {
    adminToast.error(err, 'Could not change password')
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
