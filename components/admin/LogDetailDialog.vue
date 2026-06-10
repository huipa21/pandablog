<template>
  <Teleport to="body">
    <div
      v-if="open && row"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-stone-900/45 p-4"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      @click.self="close"
    >
      <section class="grid max-h-[85vh] w-full max-w-3xl gap-4 overflow-hidden rounded-[var(--pb-radius-card-outer)] border border-[var(--pb-card-border)] bg-[var(--pb-card-bg)] p-5 shadow-[var(--pb-shadow-lg)]">
        <header class="flex items-start justify-between gap-4">
          <div>
            <h2 :id="titleId" class="text-lg font-semibold text-[var(--pb-text)]">{{ t('admin.logs.details') }}</h2>
            <p class="mt-1 text-sm text-[var(--pb-text-muted)]">{{ summary }}</p>
          </div>
          <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('common.cancel')" @click="close" />
        </header>

        <pre class="min-h-0 overflow-auto rounded-[var(--pb-radius-card-inner)] bg-stone-950 p-3 text-xs leading-relaxed text-stone-100">{{ formattedRow }}</pre>

        <footer class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" icon="i-lucide-x" @click="close">{{ t('common.cancel') }}</UButton>
          <UButton icon="i-lucide-copy" @click="copyJson">{{ t('admin.logs.copyJson') }}</UButton>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const props = defineProps<{
  open: boolean
  row: Record<string, unknown> | null
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
}>()

const { t } = useI18n()
const titleId = useId()
const formattedRow = computed(() => JSON.stringify(props.row ?? {}, null, 2))
const summary = computed(() => {
  if (!props.row) {
    return ''
  }

  const timestamp = text(props.row.timestamp)
  const primary = text(props.row.path) || text(props.row.action) || text(props.row.message) || text(props.row.id)
  return [timestamp, primary].filter(Boolean).join(' - ')
})

function close() {
  emit('update:open', false)
}

async function copyJson() {
  await navigator.clipboard.writeText(formattedRow.value)
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}
</script>