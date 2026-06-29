<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Settings</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">Post Versioning</h1>
      <p class="mt-2 max-w-2xl text-sm text-[var(--pb-text-muted)]">Configure editor-only post snapshot retention.</p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load versioning settings" />

    <form class="grid gap-5 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]" @submit.prevent="save">
      <div v-if="pending" class="grid gap-4">
        <USkeleton class="h-10" />
      </div>

      <template v-else>
        <UFormField label="Snapshot limit" name="snapshot_limit">
          <UInput v-model.number="form.snapshot_limit" type="number" min="1" max="200" icon="i-lucide-history" />
          <template #hint>
            Oldest snapshots above this limit are pruned after a new snapshot is created. Default is 20.
          </template>
        </UFormField>

        <div class="flex gap-3 pt-4">
          <UButton type="submit" icon="i-lucide-save" :loading="saving">Save Settings</UButton>
          <UButton type="button" color="neutral" variant="ghost" @click="loadSettings">Cancel</UButton>
        </div>
      </template>
    </form>
  </section>
</template>

<script setup lang="ts">
interface PostVersioningSettings {
  snapshot_limit: number
}

definePageMeta({ layout: 'admin' })

const pending = ref(true)
const saving = ref(false)
const error = ref('')
const adminToast = useAdminToast()
const form = reactive<PostVersioningSettings>({ snapshot_limit: 20 })

async function loadSettings() {
  pending.value = true
  error.value = ''
  try {
    const response = await $fetch<{ settings: PostVersioningSettings }>('/api/site/settings/versioning')
    Object.assign(form, response.settings)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load versioning settings'
  } finally {
    pending.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const response = await $fetch<{ settings: PostVersioningSettings }>('/api/admin/settings/versioning', {
      method: 'PUT',
      body: form
    })
    Object.assign(form, response.settings)
    adminToast.success('Versioning settings saved')
  } catch (err) {
    adminToast.error(err, 'Could not save versioning settings')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadSettings()
})
</script>
