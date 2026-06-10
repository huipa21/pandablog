<template>
  <main class="grid min-h-screen place-items-center bg-[var(--pb-app-bg)] px-5 py-12">
    <section class="w-full max-w-md rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-6 shadow-[var(--pb-shadow-md)]">
      <div class="mb-6">
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('public.login.eyebrow') }}</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('public.login.title') }}</h1>
      </div>

      <form class="grid gap-4" @submit.prevent="login">
        <UFormField :label="t('public.login.username')" name="username">
          <UInput v-model="username" autocomplete="username" icon="i-lucide-user" autofocus />
        </UFormField>
        <UFormField :label="t('public.login.password')" name="password">
          <UInput v-model="password" type="password" autocomplete="current-password" icon="i-lucide-key-round" />
        </UFormField>
        <UAlert v-if="errorMessage" color="error" icon="i-lucide-circle-alert" :title="errorMessage" />
        <UButton type="submit" icon="i-lucide-log-in" :loading="loading" block>
          {{ t('public.login.submit') }}
        </UButton>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

type Role = 'superadmin' | 'admin' | 'author' | 'viewer'
interface LoginUser {
  id: string
  username: string
  role: Role
}

const route = useRoute()
const { t } = useI18n()
const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

onMounted(async () => {
  const setup = await $fetch<{ completed: boolean }>('/api/auth/setup-status').catch(() => null)
  if (setup && !setup.completed) {
    await navigateTo({ path: '/admin/setup', query: { redirect: redirectTarget() } })
    return
  }

  const session = await $fetch<{ loggedIn: boolean, user: LoginUser | null }>('/api/auth/session').catch(() => null)
  if (session?.loggedIn && session.user) {
    await navigateTo(targetForRole(session.user.role))
  }
})

async function login() {
  loading.value = true
  errorMessage.value = ''

  try {
    const response = await $fetch<{ user: LoginUser }>('/api/auth/login', {
      method: 'POST',
      body: {
        username: username.value,
        password: password.value
      }
    })
    await navigateTo(targetForRole(response.user.role))
  } catch (error: any) {
    errorMessage.value = error?.data?.message ?? error?.statusMessage ?? t('public.login.invalid')
  } finally {
    loading.value = false
  }
}

function redirectTarget() {
  return String(route.query.redirect ?? '/')
}

function targetForRole(role: Role) {
  const redirect = redirectTarget()
  if (role === 'viewer') {
    return redirect.startsWith('/admin') ? '/' : redirect
  }

  return redirect || '/admin'
}
</script>