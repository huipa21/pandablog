<template>
  <UModal v-model:open="dialogOpen">
    <template #content>
      <UCard v-if="user">
        <template #header>
          <div class="flex items-center justify-between gap-4">
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <UIcon name="i-lucide-user" class="size-7 shrink-0" :class="disabledValue ? 'text-[var(--pb-text-muted)] opacity-75' : 'text-[var(--pb-text-subtle)]'" />
              <h1 class="truncate text-3xl font-semibold leading-none" :class="disabledValue ? 'text-[var(--pb-text-muted)] opacity-75' : 'text-[var(--pb-text)]'">
                {{ user.username }}
              </h1>
            </div>
            <UButton type="button" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Close" @click="dialogOpen = false" />
          </div>
        </template>

        <div class="grid gap-5">
          <UAlert v-if="formError" color="error" icon="i-lucide-circle-alert" :title="formError" />
          <UAlert v-if="passwordError" color="error" icon="i-lucide-circle-alert" :title="passwordError" />
          <UAlert v-if="notice" color="success" icon="i-lucide-check" :title="notice" />

          <div v-if="changesSummary" class="rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-surface-subtle)] p-3 text-sm">
            <p class="font-medium text-[var(--pb-text)]">Changes To Be Saved:</p>
            <ul class="mt-2 list-inside list-disc space-y-1 text-[var(--pb-text-muted)]">
              <li v-for="change in changesSummary" :key="change">{{ change }}</li>
            </ul>
          </div>

          <form class="grid gap-4" @submit.prevent="saveUser">
            <div class="grid gap-4 md:grid-cols-2">
              <UFormField label="Displayed Name" name="display_name">
                <UInput v-model="form.display_name" class="w-full" icon="i-lucide-badge" autocomplete="name" />
              </UFormField>
              <UFormField label="Email" name="email">
                <UInput v-model="form.email" class="w-full" type="email" icon="i-lucide-mail" autocomplete="email" />
              </UFormField>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <UFormField label="Role" name="role">
                <USelect v-model="form.role" class="w-full" :items="roleSelectOptions" :content="selectContent" :ui="selectUi" :disabled="roleDisabled" />
              </UFormField>
              <UFormField label="Disabled" name="disabled">
                <USwitch v-model="disabledValue" :disabled="activeDisabled" />
              </UFormField>
            </div>

            <div v-if="canResetPassword" class="grid gap-4 md:grid-cols-2">
              <div class="min-w-0">
                <UFormField label="New Password" name="password">
                  <UInput v-model="password" class="w-full min-w-0" :type="passwordVisible ? 'text' : 'password'" autocomplete="new-password" icon="i-lucide-key-round" />
                </UFormField>
              </div>
              <div class="flex items-end gap-2">
                <UButton type="button" size="sm" color="neutral" variant="ghost" :icon="passwordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'" aria-label="Toggle password visibility" @click="passwordVisible = !passwordVisible" />
                <UButton type="button" size="sm" color="neutral" variant="ghost" icon="i-lucide-copy" aria-label="Copy password" :disabled="!password.trim()" @click="copyPassword" />
                <UButton type="button" size="sm" color="neutral" variant="soft" icon="i-lucide-refresh-cw" aria-label="Generate password" @click="password = generatePassword()" />
              </div>
            </div>

            <dl class="grid gap-4 px-1 py-2 text-sm md:grid-cols-2">
              <div>
                <dt class="text-xs font-medium text-[var(--pb-text-subtle)]">Last Login</dt>
                <dd class="mt-1 text-[var(--pb-text-muted)]">{{ formatDate(user.last_login_at) }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-[var(--pb-text-subtle)]">Created</dt>
                <dd class="mt-1 text-[var(--pb-text-muted)]">{{ formatDate(user.created_at) }}</dd>
              </div>
            </dl>
          </form>
        </div>

        <template #footer>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton type="button" color="neutral" variant="ghost" :disabled="saving" @click="dialogOpen = false">Cancel</UButton>
            <UButton type="button" color="neutral" variant="ghost" :disabled="!hasChanges || saving" @click="resetFormToOriginal">Reset</UButton>
            <UButton type="submit" icon="i-lucide-save" :loading="saving" :disabled="!hasChanges" @click="saveUser">Save changes</UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>

<script setup lang="ts">
type Role = 'superadmin' | 'admin' | 'author' | 'viewer'

interface ManagedUser {
  id: string
  username: string
  role: Role
  display_name: string | null
  email: string | null
  active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

const props = defineProps<{
  open: boolean
  user: ManagedUser | null
  currentUserId?: string
  currentUserRole: Role
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'saved', user: ManagedUser): void
  (event: 'passwordReset', user: ManagedUser): void
}>()

const form = reactive({
  display_name: '',
  email: '',
  role: 'viewer' as Role,
  active: true
})
const originalForm = reactive({
  display_name: '',
  email: '',
  role: 'viewer' as Role,
  active: true
})
const password = ref('')
const passwordVisible = ref(false)
const saving = ref(false)
const formError = ref('')
const passwordError = ref('')
const notice = ref('')

const dialogOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value)
})
const disabledValue = computed({
  get: () => !form.active,
  set: (value: boolean) => {
    form.active = !value
  }
})
const isSelf = computed(() => !!props.user && props.user.id === props.currentUserId)
const canResetPassword = computed(() => !!props.user && props.user.id !== 'users:admin' && !isSelf.value)
const roleDisabled = computed(() => isSelf.value || props.user?.id === 'users:admin')
const activeDisabled = computed(() => isSelf.value)
const roleValues = computed<Role[]>(() => {
  if (props.user?.id === 'users:admin') {
    return ['superadmin']
  }

  return props.currentUserRole === 'superadmin'
    ? ['admin', 'author', 'viewer']
    : ['author', 'viewer']
})
const roleSelectOptions = computed(() => roleValues.value.map((role) => ({ label: roleLabel(role), value: role })))
const selectContent = { side: 'bottom' as const, sideOffset: 6, collisionPadding: 16 }
const selectUi = {
  base: 'w-full',
  content: 'z-[80] w-[var(--reka-select-trigger-width)] min-w-[var(--reka-select-trigger-width)]'
}

const hasChanges = computed(() => {
  return form.display_name !== originalForm.display_name
    || form.email !== originalForm.email
    || (!!form.role && form.role !== originalForm.role)
    || (form.active !== originalForm.active && !activeDisabled.value)
    || (password.value.trim() && canResetPassword.value)
})

const changesSummary = computed(() => {
  const changes: string[] = []
  if (form.display_name !== originalForm.display_name) {
    changes.push(`Display name: "${form.display_name || '(empty)'}"`)
  }
  if (form.email !== originalForm.email) {
    changes.push(`Email: "${form.email || '(empty)'}"`)
  }
  if (form.role !== originalForm.role && !roleDisabled.value) {
    changes.push(`Role: ${roleLabel(form.role)}`)
  }
  if (form.active !== originalForm.active && !activeDisabled.value) {
    changes.push(`Account: ${form.active ? 'Enabled' : 'Disabled'}`)
  }
  if (password.value.trim() && canResetPassword.value) {
    changes.push('Password: will be updated')
  }
  return changes.length > 0 ? changes : null
})

watch(() => props.user, resetForm, { immediate: true })
watch(() => props.open, (open) => {
  if (open) {
    resetForm(props.user)
  }
})

async function saveUser() {
  const user = props.user
  if (!user) return

  const body: Partial<Pick<ManagedUser, 'display_name' | 'email' | 'role' | 'active'>> = {}
  if (form.display_name !== (user.display_name ?? '')) {
    body.display_name = form.display_name
  }
  if (form.email !== (user.email ?? '')) {
    body.email = form.email
  }
  if (!roleDisabled.value && form.role !== user.role) {
    body.role = form.role
  }
  if (!activeDisabled.value && form.active !== user.active) {
    body.active = form.active
  }

  const hasUserChanges = Object.keys(body).length > 0
  const hasPasswordChange = password.value.trim() && canResetPassword.value

  if (!hasUserChanges && !hasPasswordChange) {
    dialogOpen.value = false
    return
  }

  saving.value = true
  formError.value = ''
  passwordError.value = ''
  notice.value = ''
  try {
    // Save user info if there are changes
    if (hasUserChanges) {
      await $fetch<{ user: ManagedUser }>(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PUT',
        body
      })
    }

    // Save password if provided
    if (hasPasswordChange) {
      await $fetch(`/api/admin/users/${encodeURIComponent(user.id)}/reset-password`, {
        method: 'POST',
        body: { password: password.value }
      })
    }

    // Fetch updated user info
    const response = await $fetch<{ user: ManagedUser }>(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'GET'
    })

    resetForm(response.user)
    emit('saved', response.user)
    if (hasPasswordChange) {
      emit('passwordReset', response.user)
    }
    notice.value = 'User updated.'
  } catch (error: any) {
    formError.value = error?.data?.message ?? error?.message ?? 'Could not update user'
  } finally {
    saving.value = false
  }
}

function resetFormToOriginal() {
  form.display_name = originalForm.display_name
  form.email = originalForm.email
  form.role = originalForm.role
  form.active = originalForm.active
  password.value = ''
  passwordVisible.value = false
  formError.value = ''
  passwordError.value = ''
  notice.value = ''
}

function resetForm(user: ManagedUser | null) {
  originalForm.display_name = user?.display_name ?? ''
  originalForm.email = user?.email ?? ''
  originalForm.role = user?.role ?? 'viewer'
  originalForm.active = user?.active ?? true
  form.display_name = originalForm.display_name
  form.email = originalForm.email
  form.role = originalForm.role
  form.active = originalForm.active
  password.value = ''
  passwordVisible.value = false
  formError.value = ''
  passwordError.value = ''
  notice.value = ''
}

async function copyPassword() {
  if (!password.value.trim()) return
  try {
    await navigator.clipboard.writeText(password.value)
    const prevNotice = notice.value
    notice.value = 'Password copied to clipboard.'
    setTimeout(() => {
      notice.value = prevNotice
    }, 2000)
  } catch {
    // Fallback for browsers without clipboard API
  }
}

function roleLabel(role: Role) {
  if (role === 'superadmin') {
    return 'Admin'
  }

  return role.charAt(0).toUpperCase() + role.slice(1)
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Never'
}

const passwordCharacters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?'

function generatePassword(length = 16) {
  const cryptoSource = globalThis.crypto
  if (cryptoSource?.getRandomValues) {
    const values = new Uint32Array(length)
    cryptoSource.getRandomValues(values)
    return Array.from(values, (value) => passwordCharacters[value % passwordCharacters.length]).join('')
  }

  return Array.from({ length }, () => passwordCharacters[Math.floor(Math.random() * passwordCharacters.length)]).join('')
}
</script>