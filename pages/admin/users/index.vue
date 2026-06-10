<template>
  <section class="grid gap-6">
    <div class="grid gap-4">
      <header class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-primary)]">{{ t('admin.users.eyebrow') }}</p>
          <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('admin.users.title') }}</h1>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge v-if="selectedIds.length" color="neutral" variant="subtle">{{ t('admin.users.selected', { count: selectedIds.length }) }}</UBadge>
          <UDropdownMenu v-if="selectedIds.length" :items="bulkActionItems">
            <UButton icon="i-lucide-list-checks" color="neutral" variant="soft" :loading="bulkProcessing" :disabled="bulkProcessing">
              {{ t('admin.common.actions') }}
            </UButton>
          </UDropdownMenu>
          <UInput
            v-model="searchText"
            data-admin-users-search
            :placeholder="t('admin.users.searchPlaceholder')"
            class="w-80 max-w-full"
            @keydown.enter.prevent="applySearch"
            @keydown.esc.prevent="clearSearch"
          >
            <template #leading>
              <UButton type="button" size="xs" color="neutral" variant="ghost" icon="i-lucide-search" :aria-label="t('admin.users.searchUsers')" @mousedown.prevent @click="applySearch" />
            </template>
          </UInput>
          <UButton icon="i-lucide-user-plus" @click="openCreateDialog">{{ t('admin.users.newUser') }}</UButton>
        </div>
      </header>

      <div class="pb-admin-surface flex flex-wrap items-center gap-2 p-3">
        <USelect v-model="roleFilter" :items="roleFilterOptions" size="sm" class="w-44" />
        <USelect v-model="activeFilter" :items="activeFilterOptions" size="sm" class="w-40" />
        <USelect v-model="sortBy" :items="sortOptions" size="sm" class="w-52" />
        <USelect v-model="perPage" :items="perPageOptions" size="sm" class="w-32" />
        <UButton v-if="filtersActive" size="sm" variant="ghost" color="neutral" icon="i-lucide-x" @click="clearFilters">
          {{ t('admin.common.clear') }}
        </UButton>
      </div>
    </div>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :title="t('admin.users.loadFailed')" />

    <div class="pb-admin-surface overflow-hidden">
      <div v-if="pending" class="grid gap-3 p-5">
        <USkeleton v-for="index in 4" :key="index" class="h-14" />
      </div>

      <div v-else-if="users.length" class="overflow-x-auto">
        <table class="w-full min-w-[760px] table-fixed border-collapse text-left text-sm xl:min-w-0">
          <thead class="bg-[var(--pb-surface-subtle)] text-xs uppercase tracking-wider text-[var(--pb-text-subtle)]">
            <tr>
              <th class="w-12 px-4 py-3 font-medium">
                <input
                  type="checkbox"
                  class="rounded border-[var(--pb-border-strong)]"
                  :checked="allVisibleSelected"
                  :indeterminate.prop="someVisibleSelected"
                  :aria-label="t('admin.users.selectAll')"
                  @click.stop
                  @change="toggleSelectAll($event)"
                >
              </th>
              <th class="w-[18%] px-4 py-3 font-medium">{{ t('admin.users.username') }}</th>
              <th class="w-[25%] px-4 py-3 font-medium">{{ t('admin.users.displayName') }}</th>
              <th class="w-[28%] px-4 py-3 font-medium">{{ t('admin.users.email') }}</th>
              <th class="w-[12%] px-4 py-3 font-medium">{{ t('admin.users.role') }}</th>
              <th class="w-[17%] px-4 py-3 font-medium">{{ t('admin.users.lastLogin') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--pb-border)]">
            <tr
              v-for="user in users"
              :key="user.id"
              class="cursor-pointer hover:bg-[var(--pb-surface-subtle)]"
              :class="[!user.active ? 'opacity-60' : '', selectedIds.includes(user.id) ? 'pb-selected-surface' : '']"
              @click="openUserDetail(user)"
            >
              <td class="px-4 py-3 align-top" @click.stop>
                <input v-model="selectedIds" type="checkbox" :value="user.id" class="rounded border-[var(--pb-border-strong)]" :aria-label="t('admin.users.selectUser', { username: user.username })">
              </td>
              <td class="px-4 py-3 align-top">
                <span class="block truncate font-medium text-[var(--pb-text)]">@{{ user.username }}</span>
              </td>
              <td class="px-4 py-3 align-top">
                <div class="flex min-w-0 flex-wrap items-center gap-2">
                  <span class="truncate font-medium text-[var(--pb-text)]">{{ user.display_name || user.username }}</span>
                  <UBadge v-if="!user.active" color="neutral" variant="subtle">{{ t('admin.users.disabled') }}</UBadge>
                </div>
              </td>
              <td class="truncate px-4 py-3 align-top text-[var(--pb-text-muted)]">
                {{ user.email || t('admin.users.noEmail') }}
              </td>
              <td class="px-4 py-3 align-top">
                <UBadge color="neutral" variant="subtle">{{ roleLabel(user.role) }}</UBadge>
              </td>
              <td class="truncate px-4 py-3 align-top text-[var(--pb-text-muted)]">{{ formatDate(user.last_login_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <UEmpty v-else icon="i-lucide-users" :title="t('admin.users.emptyTitle')" :description="t('admin.users.emptyDescription')" class="py-12" />

      <div v-if="!pending && totalUsers > 0" class="flex flex-col gap-3 border-t border-[var(--pb-border)] px-4 py-3 text-sm text-[var(--pb-text-muted)] md:flex-row md:items-center md:justify-between">
        <span>{{ pageRangeLabel }}</span>
        <div class="flex items-center gap-2">
          <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevrons-left" :aria-label="t('admin.common.firstPage')" :disabled="page <= 1" @click="goToPage(1)" />
          <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevron-left" :aria-label="t('admin.common.previousPage')" :disabled="page <= 1" @click="goToPage(page - 1)" />
          <span class="min-w-24 text-center">{{ t('admin.common.pageOf', { page, total: totalPages }) }}</span>
          <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevron-right" :aria-label="t('admin.common.nextPage')" :disabled="page >= totalPages" @click="goToPage(page + 1)" />
          <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-chevrons-right" :aria-label="t('admin.common.lastPage')" :disabled="page >= totalPages" @click="goToPage(totalPages)" />
        </div>
      </div>
    </div>

    <UModal v-model:open="createDialogOpen" :title="t('admin.users.newUser')">
      <template #body>
        <form class="grid gap-4" @submit.prevent="createUser">
          <UFormField :label="t('admin.users.username')" name="username">
            <UInput v-model="createForm.username" autocomplete="off" icon="i-lucide-user" autofocus />
          </UFormField>
          <UFormField :label="t('admin.users.email')" name="email">
            <UInput v-model="createForm.email" type="email" autocomplete="email" icon="i-lucide-mail" />
          </UFormField>
          <UFormField :label="t('admin.users.displayName')" name="display_name">
            <UInput v-model="createForm.display_name" autocomplete="name" icon="i-lucide-badge" />
          </UFormField>
          <UFormField :label="t('admin.users.initialPassword')" name="password">
            <div class="flex gap-2">
              <UInput v-model="createForm.password" class="flex-1" type="text" autocomplete="new-password" icon="i-lucide-key-round" />
              <UButton type="button" icon="i-lucide-refresh-cw" color="neutral" variant="soft" :aria-label="t('admin.users.generatePassword')" @click="createForm.password = generatePassword()" />
            </div>
          </UFormField>
          <UFormField :label="t('admin.users.role')" name="role">
            <USelect v-model="createForm.role" :items="createRoleOptions" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton type="button" color="neutral" variant="ghost" @click="createDialogOpen = false">{{ t('admin.common.cancel') }}</UButton>
            <UButton type="submit" icon="i-lucide-user-plus" :loading="creating">{{ t('admin.users.createUser') }}</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <AdminConfirmActionDialog
      :open="confirmDialog.open"
      :title="confirmDialog.title"
      :description="confirmDialog.description"
      :confirm-label="confirmDialog.confirmLabel"
      :confirm-color="confirmDialog.confirmColor"
      :loading="bulkProcessing"
      @update:open="(value) => { if (!value) closeConfirmDialog() }"
      @cancel="closeConfirmDialog"
      @confirm="confirmBulkStatusAction"
    />

    <AdminSelectDialog
      :open="roleDialog.open"
      :title="t('admin.users.assignRole')"
      :label="t('admin.users.role')"
      :items="bulkRoleOptions"
      :initial-value="roleDialog.role"
      :confirm-label="t('admin.users.assignRoleConfirm')"
      :loading="bulkProcessing"
      @update:open="(value) => { if (!value) closeRoleDialog() }"
      @cancel="closeRoleDialog"
      @confirm="assignRoleToSelected"
    />

    <AdminUserDetailDialog
      v-model:open="detailDialogOpen"
      :user="selectedUser"
      :current-user-id="currentUser?.id"
      :current-user-role="currentRole"
      @saved="handleUserSaved"
      @password-reset="handlePasswordReset"
    />
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { t, locale } = useI18n()

type Role = 'superadmin' | 'admin' | 'author' | 'viewer'
type RoleFilter = Role | 'all'
type ActiveFilter = 'all' | 'enabled' | 'disabled'
type UserSort = 'username_asc' | 'username_desc' | 'display_name_asc' | 'display_name_desc' | 'last_login_desc' | 'last_login_asc' | 'created_desc' | 'created_asc'
type PerPageOption = '10' | '20' | '30'
type BulkStatusAction = 'enable' | 'disable'

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

interface UsersResponse {
  users: ManagedUser[]
  total: number
  limit: number
  start: number
}

const { data: session } = await useAsyncData('admin-users-session', () => $fetch<{ user: ManagedUser | null }>('/api/auth/session'), {
  default: () => ({ user: null })
})
const currentUser = computed(() => session.value.user)
const currentRole = computed<Role>(() => currentUser.value?.role ?? 'viewer')

const searchText = ref('')
const roleFilter = ref<RoleFilter>('all')
const activeFilter = ref<ActiveFilter>('all')
const sortBy = ref<UserSort>('last_login_desc')
const perPage = ref<PerPageOption>('10')
const page = ref(1)
const selectedIds = ref<string[]>([])
const detailDialogOpen = ref(false)
const selectedUser = ref<ManagedUser | null>(null)
const adminToast = useAdminToast()
const creating = ref(false)
const bulkProcessing = ref(false)
const createDialogOpen = ref(false)

const createForm = reactive({ username: '', email: '', display_name: '', password: '', role: 'viewer' as Role })
const confirmDialog = reactive({
  open: false,
  action: 'disable' as BulkStatusAction,
  title: '',
  description: '',
  confirmLabel: '',
  confirmColor: 'warning' as 'primary' | 'error' | 'warning' | 'neutral',
  ids: [] as string[]
})
const roleDialog = reactive({
  open: false,
  role: 'viewer' as Role,
  ids: [] as string[]
})

const roleValues = computed<Role[]>(() => currentRole.value === 'superadmin'
  ? ['admin', 'author', 'viewer']
  : ['author', 'viewer']
)
const roleFilterOptions = computed(() => [
  { label: t('admin.users.filters.allRoles'), value: 'all' },
  ...roleValues.value.map((role) => ({ label: roleLabel(role), value: role }))
])
const createRoleOptions = computed(() => roleValues.value.map((role) => ({ label: roleLabel(role), value: role })))
const bulkRoleOptions = computed(() => createRoleOptions.value)
const activeFilterOptions = computed(() => [
  { label: t('admin.users.filters.allAccounts'), value: 'all' },
  { label: t('admin.users.filters.enabled'), value: 'enabled' },
  { label: t('admin.users.filters.disabled'), value: 'disabled' }
])
const sortOptions = computed(() => [
  { label: t('admin.users.sort.lastLoginNewest'), value: 'last_login_desc' },
  { label: t('admin.users.sort.lastLoginOldest'), value: 'last_login_asc' },
  { label: t('admin.users.sort.usernameAsc'), value: 'username_asc' },
  { label: t('admin.users.sort.usernameDesc'), value: 'username_desc' },
  { label: t('admin.users.sort.displayNameAsc'), value: 'display_name_asc' },
  { label: t('admin.users.sort.displayNameDesc'), value: 'display_name_desc' },
  { label: t('admin.users.sort.createdNewest'), value: 'created_desc' },
  { label: t('admin.users.sort.createdOldest'), value: 'created_asc' }
])
const perPageOptions = computed(() => [
  { label: t('admin.common.perPage', { count: 10 }), value: '10' },
  { label: t('admin.common.perPage', { count: 20 }), value: '20' },
  { label: t('admin.common.perPage', { count: 30 }), value: '30' }
])

const perPageNumber = computed(() => Number(perPage.value))
const start = computed(() => (page.value - 1) * perPageNumber.value)
const userListQuery = computed(() => ({
  limit: perPageNumber.value,
  start: start.value,
  sort: sortBy.value,
  ...(searchText.value.trim() ? { q: searchText.value.trim() } : {}),
  ...(roleFilter.value === 'all' ? {} : { role: roleFilter.value }),
  ...(activeFilter.value === 'all' ? {} : { active: activeFilter.value })
}))

const { data, pending, error, refresh } = await useAsyncData(
  'admin-users',
  () => $fetch<UsersResponse>('/api/admin/users', { query: userListQuery.value }),
  {
    default: () => ({ users: [], total: 0, limit: 10, start: 0 }),
    watch: [userListQuery]
  }
)

const users = computed(() => data.value.users)
const totalUsers = computed(() => data.value.total)
const totalPages = computed(() => Math.max(1, Math.ceil(totalUsers.value / perPageNumber.value)))
const pageRangeLabel = computed(() => {
  if (!totalUsers.value) {
    return t('admin.users.showingZero')
  }

  const first = start.value + 1
  const last = Math.min(start.value + users.value.length, totalUsers.value)
  return t('admin.users.showingRange', { first, last, total: totalUsers.value })
})
const filtersActive = computed(() => Boolean(searchText.value.trim())
  || roleFilter.value !== 'all'
  || activeFilter.value !== 'all'
  || sortBy.value !== 'last_login_desc'
  || perPage.value !== '10')
const allVisibleSelected = computed(() => users.value.length > 0 && users.value.every((user) => selectedIds.value.includes(user.id)))
const someVisibleSelected = computed(() => !allVisibleSelected.value && users.value.some((user) => selectedIds.value.includes(user.id)))
const selectedUsers = computed(() => users.value.filter((user) => selectedIds.value.includes(user.id)))
const hasEnabledSelection = computed(() => selectedUsers.value.some((user) => user.active && user.id !== currentUser.value?.id))
const hasDisabledSelection = computed(() => selectedUsers.value.some((user) => !user.active))
const bulkActionItems = computed(() => [[
  {
    label: t('admin.users.actions.disable'),
    icon: 'i-lucide-user-x',
    color: 'warning' as const,
    disabled: !hasEnabledSelection.value,
    onSelect: () => openBulkStatusDialog('disable')
  },
  {
    label: t('admin.users.actions.enable'),
    icon: 'i-lucide-user-check',
    color: 'primary' as const,
    disabled: !hasDisabledSelection.value,
    onSelect: () => openBulkStatusDialog('enable')
  },
  {
    label: t('admin.users.actions.assignRole'),
    icon: 'i-lucide-badge-check',
    onSelect: openRoleDialog
  }
]])

watch(roleValues, (roles) => {
  if (roleFilter.value !== 'all' && !roles.includes(roleFilter.value)) {
    roleFilter.value = 'all'
  }
  if (!roles.includes(createForm.role)) {
    createForm.role = roles[0] ?? 'viewer'
  }
  if (!roles.includes(roleDialog.role)) {
    roleDialog.role = roles[0] ?? 'viewer'
  }
}, { immediate: true })

watch([searchText, roleFilter, activeFilter, sortBy, perPage], () => {
  page.value = 1
  selectedIds.value = []
  closeConfirmDialog()
  closeRoleDialog()
})

watch(page, () => {
  selectedIds.value = []
  closeConfirmDialog()
  closeRoleDialog()
})

watch(totalPages, (next) => {
  if (page.value > next) {
    page.value = next
  }
})

async function applySearch() {
  page.value = 1
  selectedIds.value = []
  await refresh()
}

function clearSearch() {
  searchText.value = ''
}

function clearFilters() {
  searchText.value = ''
  roleFilter.value = 'all'
  activeFilter.value = 'all'
  sortBy.value = 'last_login_desc'
  perPage.value = '10'
  page.value = 1
}

function toggleSelectAll(event: Event) {
  const checked = (event.target as HTMLInputElement).checked

  if (checked) {
    selectedIds.value = Array.from(new Set([...selectedIds.value, ...users.value.map((user) => user.id)]))
    return
  }

  const visibleIds = new Set(users.value.map((user) => user.id))
  selectedIds.value = selectedIds.value.filter((userId) => !visibleIds.has(userId))
}

function openCreateDialog() {
  resetCreateForm()
  createDialogOpen.value = true
}

function resetCreateForm() {
  createForm.username = ''
  createForm.email = ''
  createForm.display_name = ''
  createForm.password = generatePassword()
  createForm.role = roleValues.value[0] ?? 'viewer'
}

async function createUser() {
  creating.value = true
  try {
    await $fetch('/api/admin/users', { method: 'POST', body: createForm })
    resetCreateForm()
    createDialogOpen.value = false
    adminToast.success(t('admin.users.createdToast'))
    await refresh()
  } catch (error: any) {
    adminToast.error(error, t('admin.users.createFailed'))
  } finally {
    creating.value = false
  }
}

function openUserDetail(user: ManagedUser) {
  selectedUser.value = user
  detailDialogOpen.value = true
}

async function handleUserSaved(user: ManagedUser) {
  selectedUser.value = user
  await refresh()
}

function handlePasswordReset() {
  // Feedback is shown by the detail dialog toast.
}

function openBulkStatusDialog(action: BulkStatusAction) {
  if (!selectedIds.value.length) {
    return
  }

  const ids = Array.from(new Set(selectedIds.value))
  const count = ids.length
  const isDisable = action === 'disable'

  confirmDialog.open = true
  confirmDialog.action = action
  confirmDialog.title = isDisable
    ? t(count === 1 ? 'admin.users.bulk.disableOneTitle' : 'admin.users.bulk.disableManyTitle', { count })
    : t(count === 1 ? 'admin.users.bulk.enableOneTitle' : 'admin.users.bulk.enableManyTitle', { count })
  confirmDialog.description = isDisable
    ? t('admin.users.bulk.disableDescription')
    : t('admin.users.bulk.enableDescription')
  confirmDialog.confirmLabel = isDisable
    ? t(count === 1 ? 'admin.users.bulk.disableOneConfirm' : 'admin.users.bulk.disableManyConfirm', { count })
    : t(count === 1 ? 'admin.users.bulk.enableOneConfirm' : 'admin.users.bulk.enableManyConfirm', { count })
  confirmDialog.confirmColor = isDisable ? 'warning' : 'primary'
  confirmDialog.ids = ids
}

function closeConfirmDialog() {
  if (bulkProcessing.value) {
    return
  }

  confirmDialog.open = false
  confirmDialog.ids = []
}

async function confirmBulkStatusAction() {
  if (!confirmDialog.ids.length) {
    closeConfirmDialog()
    return
  }

  await runBulkAction(confirmDialog.action, confirmDialog.ids)
  closeConfirmDialog()
}

function openRoleDialog() {
  if (!selectedIds.value.length) {
    return
  }

  roleDialog.ids = Array.from(new Set(selectedIds.value))
  roleDialog.role = roleValues.value[0] ?? 'viewer'
  roleDialog.open = true
}

function closeRoleDialog() {
  if (bulkProcessing.value) {
    return
  }

  roleDialog.open = false
  roleDialog.ids = []
}

async function assignRoleToSelected(role: string) {
  if (!roleDialog.ids.length || !isRole(role)) {
    closeRoleDialog()
    return
  }

  await runBulkAction('role', roleDialog.ids, role)
  closeRoleDialog()
}

async function runBulkAction(action: BulkStatusAction | 'role', ids: string[], role?: Role) {
  bulkProcessing.value = true

  try {
    const response = await $fetch<{
      updated: number
      failed: number
      updated_ids: string[]
      failures: Array<{ id: string, message: string }>
    }>('/api/admin/users/bulk', {
      method: 'POST',
      body: {
        ids,
        action,
        ...(role ? { role } : {})
      }
    })

    const updatedIds = new Set(response.updated_ids ?? [])
    selectedIds.value = selectedIds.value.filter((userId) => !updatedIds.has(userId))
    if (response.updated > 0) {
      adminToast.success(t('admin.users.bulk.updated', { count: response.updated }))
    }
    if (response.failed > 0) {
      const firstFailure = response.failures?.[0]?.message ?? t('admin.users.bulk.partialFailedTitle')
      adminToast.error(new Error(t('admin.users.bulk.partialFailedMessage', { count: response.failed, message: firstFailure })), t('admin.users.bulk.partialFailedTitle'))
    }
    await refresh()
  } catch (error: any) {
    adminToast.error(error, t('admin.users.bulk.updateSelectedFailed'))
  } finally {
    bulkProcessing.value = false
  }
}

function goToPage(nextPage: number) {
  page.value = Math.min(Math.max(nextPage, 1), totalPages.value)
}

function roleLabel(role: Role) {
  return t(`admin.users.roles.${role}`)
}

function isRole(value: string): value is Role {
  return value === 'admin' || value === 'author' || value === 'viewer'
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : t('admin.users.never')
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