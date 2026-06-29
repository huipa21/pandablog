<template>
  <div class="flex h-full flex-col">
    <header class="mb-3 flex items-center justify-between gap-2">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-[var(--pb-text)]">{{ t('admin.editor.versions') }}</h2>
        <p class="truncate text-xs text-[var(--pb-text-subtle)]">{{ t('admin.editor.versionsPanel.subtitle') }}</p>
      </div>
      <UButton
        type="button"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="t('admin.common.close')"
        @click="emit('close')"
      />
    </header>

    <div class="-mx-1 flex-1 overflow-y-auto px-1">
      <ul v-if="versions.length" class="space-y-1.5">
        <li
          v-for="(version, index) in versions"
          :key="version.version"
          class="group flex items-start gap-2 rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)] bg-[var(--pb-card-bg)] px-3 py-2"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-[var(--pb-text)]">
              {{ index === 0 ? t('admin.editor.versionsPanel.current') : t('admin.editor.versionsPanel.version', { n: versions.length - index }) }}
            </p>
            <p class="text-xs text-[var(--pb-text-subtle)]">{{ formatVersionDate(version) }}</p>
            <p class="mt-0.5 flex items-center gap-1 text-xs text-[var(--pb-text-muted)]">
              <UIcon name="i-lucide-user" class="size-3 shrink-0" />
              <span class="truncate">{{ version.ownerName || t('admin.editor.versionsPanel.unknownOwner') }}</span>
              <span class="text-[var(--pb-text-subtle)]">·</span>
              <span>{{ t('admin.editor.versionsPanel.changedBlocks', version.diff.length) }}</span>
            </p>
          </div>
          <UDropdownMenu :items="rowMenuItems(version)">
            <UButton
              type="button"
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('admin.editor.versionsPanel.more')"
            />
          </UDropdownMenu>
        </li>
      </ul>
      <div v-else class="rounded-[var(--pb-radius-card-inner)] border border-dashed border-[var(--pb-divider)] px-3 py-8 text-center text-sm text-[var(--pb-text-muted)]">
        {{ t('admin.editor.versionsPanel.empty') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PostVersionListItem } from '~/types/editor'

const props = defineProps<{
  versions: PostVersionListItem[]
  readOnly?: boolean
}>()

const emit = defineEmits<{
  close: []
  diff: [version: PostVersionListItem]
  restore: [version: PostVersionListItem]
  delete: [version: PostVersionListItem]
}>()

const { t } = useI18n()
const { formatAdminDateTime } = useAdminRegionalSettings()

function formatVersionDate(version: PostVersionListItem) {
  return version.datetime ? formatAdminDateTime(version.datetime) : version.version
}

function rowMenuItems(version: PostVersionListItem) {
  return [[
    { label: t('admin.editor.versionsPanel.showDiff'), icon: 'i-lucide-git-compare', onSelect: () => emit('diff', version) },
    { label: t('admin.editor.versionsPanel.restore'), icon: 'i-lucide-rotate-ccw', disabled: props.readOnly, onSelect: () => emit('restore', version) },
    { label: t('admin.editor.versionsPanel.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, disabled: props.readOnly, onSelect: () => emit('delete', version) }
  ]]
}
</script>
