<template>
  <section class="grid gap-6">
    <header>
      <p class="text-sm font-medium uppercase tracking-wider text-[var(--pb-link)]">Settings</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-normal text-[var(--pb-text)]">Footer</h1>
      <p class="mt-2 max-w-2xl text-sm text-[var(--pb-text-muted)]">Configure copyright text, footer links, and social icon links.</p>
    </header>

    <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" title="Could not load settings" />
    <UAlert v-if="saveError" color="error" icon="i-lucide-circle-alert" :title="saveError" />
    <UAlert v-if="notice" color="success" icon="i-lucide-check" :title="notice" />

    <form class="grid gap-6 rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-sm)]" @submit.prevent="save">
      <div v-if="pending" class="grid gap-4">
        <USkeleton class="h-10" />
        <USkeleton class="h-24" />
        <USkeleton class="h-24" />
      </div>

      <template v-else>
        <UFormField label="Copyright" name="footer_copyright">
          <UInput v-model="form.footer_copyright" icon="i-lucide-copyright" placeholder="© 2026 Your Site. All rights reserved." />
        </UFormField>

        <section class="grid gap-3">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-base font-semibold text-[var(--pb-text)]">Footer links</h2>
            <UButton type="button" icon="i-lucide-plus" variant="soft" size="sm" @click="addFooterLink">Add link</UButton>
          </div>
          <div v-if="form.footer_links.length" class="grid gap-3">
            <div v-for="(link, index) in form.footer_links" :key="index" class="grid gap-2 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3 md:grid-cols-[1fr_1.6fr_auto]">
              <UInput v-model="link.label" placeholder="Label" icon="i-lucide-type" />
              <UInput v-model="link.url" placeholder="/about or https://..." icon="i-lucide-link" />
              <UButton type="button" icon="i-lucide-trash-2" color="error" variant="ghost" @click="removeFooterLink(index)" />
            </div>
          </div>
          <p v-else class="rounded-[var(--pb-radius-card-inner)] border border-dashed border-[var(--pb-divider-strong)] p-4 text-sm text-[var(--pb-text-subtle)]">No footer links yet.</p>
        </section>

        <section class="grid gap-3">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-base font-semibold text-[var(--pb-text)]">Social links</h2>
            <UButton type="button" icon="i-lucide-plus" variant="soft" size="sm" @click="addSocialLink">Add social</UButton>
          </div>
          <div v-if="form.footer_social.length" class="grid gap-3">
            <div v-for="(link, index) in form.footer_social" :key="index" class="grid gap-2 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] p-3 md:grid-cols-[1fr_1fr_1.6fr_auto]">
              <UInput v-model="link.label" placeholder="Label" icon="i-lucide-type" />
              <UInput v-model="link.icon" placeholder="i-lucide-github" icon="i-lucide-smile" />
              <UInput v-model="link.url" placeholder="https://..." icon="i-lucide-link" />
              <UButton type="button" icon="i-lucide-trash-2" color="error" variant="ghost" @click="removeSocialLink(index)" />
            </div>
          </div>
          <p v-else class="rounded-[var(--pb-radius-card-inner)] border border-dashed border-[var(--pb-divider-strong)] p-4 text-sm text-[var(--pb-text-subtle)]">No social links yet.</p>
        </section>

        <div class="flex justify-end">
          <UButton type="submit" icon="i-lucide-save" :loading="saving">Save footer</UButton>
        </div>
      </template>
    </form>
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

interface FooterLink {
  label: string
  url: string
  icon?: string
}

const { data, pending, error } = await useAsyncData('admin-settings-footer', () => $fetch<{ settings: Record<string, unknown> }>('/api/admin/settings'))

const form = reactive({
  footer_copyright: '',
  footer_links: [] as FooterLink[],
  footer_social: [] as FooterLink[]
})
const saving = ref(false)
const notice = ref('')
const saveError = ref('')

watch(data, (value) => {
  const settings = value?.settings ?? {}
  form.footer_copyright = textValue(settings.footer_copyright)
  form.footer_links = linksValue(settings.footer_links)
  form.footer_social = linksValue(settings.footer_social)
}, { immediate: true })

function addFooterLink() {
  form.footer_links.push({ label: '', url: '' })
}

function removeFooterLink(index: number) {
  form.footer_links.splice(index, 1)
}

function addSocialLink() {
  form.footer_social.push({ label: '', icon: 'i-lucide-link', url: '' })
}

function removeSocialLink(index: number) {
  form.footer_social.splice(index, 1)
}

async function save() {
  saving.value = true
  notice.value = ''
  saveError.value = ''

  try {
    await $fetch('/api/admin/settings', {
      method: 'POST',
      body: {
        footer_copyright: form.footer_copyright,
        footer_links: cleanLinks(form.footer_links),
        footer_social: cleanLinks(form.footer_social)
      }
    })
    notice.value = 'Footer saved'
  } catch (err: any) {
    saveError.value = err?.statusMessage ?? err?.message ?? 'Could not save footer'
  } finally {
    saving.value = false
  }
}

function cleanLinks(links: FooterLink[]) {
  return links
    .map((link) => ({
      label: link.label.trim(),
      url: link.url.trim(),
      icon: link.icon?.trim()
    }))
    .filter((link) => link.label && link.url)
}

function linksValue(value: unknown): FooterLink[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => {
    const link = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    return {
      label: textValue(link.label),
      url: textValue(link.url),
      icon: textValue(link.icon)
    }
  })
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}
</script>
