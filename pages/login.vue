<template>
  <main class="login-page">
    <img src="/defaults/site-banner.jpg" alt="" class="login-page__image">
    <div class="login-page__overlay" aria-hidden="true" />

    <section class="login-panel" aria-labelledby="login-title">
      <h1 id="login-title" class="login-panel__title">{{ t('admin.nav.login') }}</h1>

      <form class="login-form" @submit.prevent="login">
        <label class="login-field">
          <span>{{ t('public.login.username') }}</span>
          <input
            v-model="username"
            class="login-input"
            type="text"
            autocomplete="username"
            required
            autofocus
          >
        </label>

        <label class="login-field">
          <span>{{ t('public.login.password') }}</span>
          <input
            v-model="password"
            class="login-input"
            type="password"
            autocomplete="current-password"
            required
          >
        </label>

        <p v-if="errorMessage" class="login-error" role="alert">{{ errorMessage }}</p>

        <button class="login-submit" type="submit" :disabled="loading" :aria-busy="loading">
          {{ t('public.login.submit') }}
        </button>
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

<style scoped>
.login-page {
  position: relative;
  isolation: isolate;
  display: grid;
  min-height: 100vh;
  place-items: center;
  overflow: hidden;
  padding: clamp(1rem, 5vw, 3rem);
  background: var(--pb-hero-bg);
  color: var(--pb-text);
}

.login-page__image {
  position: absolute;
  inset: 0;
  z-index: -3;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.login-page__overlay {
  position: absolute;
  inset: 0;
  z-index: -2;
  background:
    radial-gradient(circle at 50% 28%, color-mix(in srgb, var(--pb-surface) 58%, transparent), transparent 34rem),
    linear-gradient(135deg, color-mix(in srgb, var(--pb-hero-bg) 54%, transparent), color-mix(in srgb, var(--pb-primary) 24%, transparent)),
    color-mix(in srgb, var(--pb-app-bg) 18%, transparent);
}

.login-panel {
  width: min(100%, 25rem);
  min-height: min(32rem, calc(100vh - 2rem));
  display: grid;
  align-content: center;
  gap: 2.5rem;
  padding: clamp(2rem, 5vw, 3rem);
  border: 1px solid color-mix(in srgb, var(--pb-border-strong) 68%, transparent);
  border-radius: calc(var(--pb-radius-card-outer) + 0.75rem);
  background: color-mix(in srgb, var(--pb-surface) 54%, transparent);
  box-shadow: 0 1.5rem 5rem color-mix(in srgb, var(--pb-card-shadow-color) 72%, transparent);
  backdrop-filter: blur(22px) saturate(120%);
}

.login-panel__title {
  margin: 0;
  color: var(--pb-text);
  font-family: var(--pb-font-display);
  font-size: clamp(2rem, 8vw, 2.75rem);
  font-weight: 650;
  line-height: 1;
  text-align: center;
}

.login-form {
  display: grid;
  gap: 1.75rem;
}

.login-field {
  display: grid;
  gap: 0.45rem;
  color: var(--pb-text);
  font-size: 0.95rem;
  font-weight: 650;
}

.login-input {
  width: 100%;
  min-width: 0;
  height: 3rem;
  padding: 0.25rem 0 0.6rem;
  border: 0;
  border-bottom: 2px solid color-mix(in srgb, var(--pb-text) 62%, transparent);
  border-radius: 0;
  outline: 0;
  background: transparent;
  color: var(--pb-text);
  font: inherit;
  transition: border-color var(--pb-transition-default), box-shadow var(--pb-transition-default);
}

.login-input:focus {
  border-color: var(--pb-primary);
  box-shadow: inset 0 -1px 0 var(--pb-primary);
}

.login-error {
  margin: -0.5rem 0 0;
  color: #b42318;
  font-size: 0.875rem;
  font-weight: 650;
  line-height: 1.4;
}

.login-submit {
  display: inline-grid;
  min-height: 3rem;
  place-items: center;
  margin-top: 0.25rem;
  border: 0;
  border-radius: 999px;
  background: var(--pb-primary);
  color: var(--pb-primary-contrast);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  transition: background var(--pb-transition-default), opacity var(--pb-transition-default), transform var(--pb-transition-default);
}

.login-submit:hover:not(:disabled),
.login-submit:focus-visible:not(:disabled) {
  background: var(--pb-primary-hover);
  transform: translateY(-1px);
}

.login-submit:focus-visible {
  outline: 0;
  box-shadow: var(--pb-focus-ring);
}

.login-submit:disabled {
  cursor: progress;
  opacity: 0.72;
}

@media (max-width: 480px) {
  .login-panel {
    min-height: auto;
    gap: 2rem;
  }
}
</style>