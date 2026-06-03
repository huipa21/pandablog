<template>
  <main class="grid min-h-screen place-items-center bg-stone-100 px-5 py-12">
    <section class="w-full max-w-md rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
      <div class="mb-6">
        <p class="text-sm font-medium uppercase tracking-wider text-teal-700">First run</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-normal text-stone-950">Set up PandaBlog</h1>
        <p class="mt-2 text-sm text-stone-600">Create the admin password for this deployment.</p>
      </div>

      <form class="grid gap-4" @submit.prevent="completeSetup">
        <UFormField label="Username" name="username">
          <UInput :model-value="username" icon="i-lucide-user" disabled />
        </UFormField>
        <UFormField label="Password" name="password">
          <UInput v-model="password" type="password" autocomplete="new-password" icon="i-lucide-key-round" autofocus />
        </UFormField>
        <UFormField label="Confirm password" name="confirm_password">
          <UInput v-model="confirmPassword" type="password" autocomplete="new-password" icon="i-lucide-key-round" />
        </UFormField>
        <UAlert v-if="errorMessage" color="error" icon="i-lucide-circle-alert" :title="errorMessage" />
        <UButton type="submit" icon="i-lucide-check" :loading="loading" block>
          Complete setup
        </UButton>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const username = 'admin'
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const errorMessage = ref('')

onMounted(async () => {
  const setup = await $fetch<{ completed: boolean }>('/api/auth/setup-status').catch(() => null)
  if (setup?.completed) {
    await navigateTo('/admin/login')
  }
})

async function completeSetup() {
  loading.value = true
  errorMessage.value = ''

  try {
    await $fetch('/api/auth/setup', {
      method: 'POST',
      body: {
        password: password.value,
        confirm_password: confirmPassword.value
      }
    })
    await navigateTo(String(route.query.redirect ?? '/admin'))
  } catch (err: any) {
    errorMessage.value = err?.data?.message ?? err?.statusMessage ?? err?.message ?? 'Could not complete setup'
  } finally {
    loading.value = false
  }
}
</script>