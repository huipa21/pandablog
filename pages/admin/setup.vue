<template>
  <main class="grid min-h-screen place-items-center bg-[var(--pb-app-bg)] px-5 py-12">
    <section class="w-full max-w-md rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-6 shadow-[var(--pb-shadow-md)]">
      <div class="mb-6">
        <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">{{ t('admin.setup.eyebrow') }}</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-normal text-[var(--pb-text)]">{{ t('admin.setup.title') }}</h1>
        <p class="mt-2 text-sm text-[var(--pb-text-muted)]">{{ t('admin.setup.description') }}</p>
      </div>

      <form class="grid gap-4" @submit.prevent="completeSetup">
        <UFormField :label="t('admin.setup.username')" name="username">
          <UInput :model-value="username" icon="i-lucide-user" disabled />
        </UFormField>
        <UFormField :label="t('admin.setup.password')" name="password">
          <UInput v-model="password" type="password" autocomplete="new-password" icon="i-lucide-key-round" autofocus />
        </UFormField>
        <UFormField :label="t('admin.setup.confirmPassword')" name="confirm_password">
          <UInput v-model="confirmPassword" type="password" autocomplete="new-password" icon="i-lucide-key-round" />
        </UFormField>
        <UAlert v-if="errorMessage" color="error" icon="i-lucide-circle-alert" :title="errorMessage" />
        <UButton type="submit" icon="i-lucide-check" :loading="loading" block>
          {{ t('admin.setup.complete') }}
        </UButton>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const { t } = useI18n()
const username = 'admin'
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const errorMessage = ref('')

onMounted(async () => {
  const setup = await $fetch<{ completed: boolean }>('/api/auth/setup-status').catch(() => null)
  if (setup?.completed) {
    await navigateTo('/login')
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
    errorMessage.value = err?.data?.message ?? err?.statusMessage ?? err?.message ?? t('admin.setup.failed')
  } finally {
    loading.value = false
  }
}
</script>