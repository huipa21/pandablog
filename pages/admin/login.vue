<template>
  <main class="grid min-h-screen place-items-center bg-stone-100 px-5 py-12">
    <section class="w-full max-w-md rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
      <div class="mb-6">
        <p class="text-sm font-medium uppercase tracking-wider text-teal-700">Admin</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-normal text-stone-950">Sign in to PandaBlog</h1>
      </div>

      <form class="grid gap-4" @submit.prevent="login">
        <UFormField label="Username" name="username">
          <UInput v-model="username" autocomplete="username" icon="i-lucide-user" disabled />
        </UFormField>
        <UFormField label="Password" name="password">
          <UInput v-model="password" type="password" autocomplete="current-password" icon="i-lucide-key-round" autofocus />
        </UFormField>
        <UAlert v-if="errorMessage" color="error" icon="i-lucide-circle-alert" :title="errorMessage" />
        <UButton type="submit" icon="i-lucide-log-in" :loading="loading" block>
          Sign in
        </UButton>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const username = ref('admin')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

onMounted(async () => {
  const setup = await $fetch<{ completed: boolean }>('/api/auth/setup-status').catch(() => null)
  if (setup && !setup.completed) {
    await navigateTo({ path: '/admin/setup', query: { redirect: String(route.query.redirect ?? '/admin') } })
    return
  }

  const session = await $fetch<{ loggedIn: boolean }>('/api/auth/session').catch(() => null)
  if (session?.loggedIn) {
    await navigateTo(String(route.query.redirect ?? '/admin'))
  }
})

async function login() {
  loading.value = true
  errorMessage.value = ''

  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: {
        username: username.value,
        password: password.value
      }
    })
    await navigateTo(String(route.query.redirect ?? '/admin'))
  } catch {
    errorMessage.value = 'Invalid username or password'
  } finally {
    loading.value = false
  }
}
</script>