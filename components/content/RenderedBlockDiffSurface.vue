<template>
  <div class="rendered-block-diff" contenteditable="false">
    <div class="rendered-block-diff-header">
      <div class="rendered-block-diff-title">
        <UIcon name="i-lucide-columns-2" class="rendered-block-diff-icon" />
        <span>{{ oldLabelText }}</span>
        <UIcon name="i-lucide-arrow-right" class="rendered-block-diff-arrow" />
        <span>{{ newLabelText }}</span>
        <span v-if="changedCount" class="rendered-block-diff-stat is-changed">{{ changedCount }} changed</span>
        <span v-if="addedCount" class="rendered-block-diff-stat is-added">+{{ addedCount }}</span>
        <span v-if="removedCount" class="rendered-block-diff-stat is-removed">-{{ removedCount }}</span>
      </div>

      <div class="rendered-block-diff-tools" role="toolbar" aria-label="Rendered comparison controls">
        <button
          type="button"
          class="rendered-block-diff-tool"
          :class="filter === 'changed' ? 'is-active' : ''"
          :aria-pressed="filter === 'changed'"
          @click="toggleFilter"
        >
          <UIcon name="i-lucide-filter" class="rendered-block-diff-tool-icon" />
          <span>{{ filter === 'changed' ? 'Changed' : 'All' }}</span>
        </button>
        <button
          v-if="hasAdvancedText"
          type="button"
          class="rendered-block-diff-tool"
          :class="viewMode === 'text' ? 'is-active' : ''"
          :aria-pressed="viewMode === 'text'"
          @click="toggleViewMode"
        >
          <UIcon :name="viewMode === 'text' ? 'i-lucide-columns-2' : 'i-lucide-code-2'" class="rendered-block-diff-tool-icon" />
          <span>{{ viewMode === 'text' ? 'Rendered view' : 'Text diff' }}</span>
        </button>
      </div>
    </div>

    <div v-if="viewMode === 'rendered'" class="rendered-block-diff-columns" aria-hidden="true">
      <span>{{ oldLabelText }}</span>
      <span>{{ newLabelText }}</span>
    </div>

    <div v-if="viewMode === 'rendered'" class="rendered-block-diff-body">
      <div
        v-for="row in visibleRows"
        :key="row.id"
        class="rendered-block-diff-row"
        :class="`is-${row.status}`"
      >
        <div class="rendered-block-diff-cell is-old">
          <div v-if="row.oldNode" class="rendered-block-diff-prose pb-prose">
            <ContentRenderer :node="row.oldNode" />
          </div>
          <div v-else class="rendered-block-diff-empty is-added-space">
            <UIcon name="i-lucide-plus" class="rendered-block-diff-empty-icon" />
            <span>Added in local draft</span>
          </div>
        </div>

        <div class="rendered-block-diff-cell is-new">
          <div v-if="row.newNode" class="rendered-block-diff-prose pb-prose">
            <ContentRenderer :node="row.newNode" />
          </div>
          <div v-else class="rendered-block-diff-empty is-removed-space">
            <UIcon name="i-lucide-minus" class="rendered-block-diff-empty-icon" />
            <span>Missing from local draft</span>
          </div>
        </div>
      </div>

      <div v-if="!visibleRows.length" class="rendered-block-diff-none">
        No content changes found.
      </div>
    </div>

    <div v-else-if="hasAdvancedText" class="rendered-block-diff-advanced">
      <DiffBlockSurface
        :old-text="oldText ?? ''"
        :new-text="newText ?? ''"
        language="plaintext"
        :old-label="oldLabelText"
        :new-label="newLabelText"
        :filter="filter"
        hide-filter-control
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'
import { buildRenderedBlockDiff } from '~/utils/renderedBlockDiff'
import ContentRenderer from './ContentRenderer.vue'
import DiffBlockSurface from './DiffBlockSurface.vue'

type DiffFilter = 'all' | 'changed'
type DiffViewMode = 'rendered' | 'text'

const props = defineProps<{
  oldDoc?: JsonContent | null
  newDoc?: JsonContent | null
  oldText?: string
  newText?: string
  oldLabel: string
  newLabel: string
}>()

const filter = ref<DiffFilter>('all')
const viewMode = ref<DiffViewMode>('rendered')

const oldLabelText = computed(() => props.oldLabel.trim() || 'Published')
const newLabelText = computed(() => props.newLabel.trim() || 'Local draft')
const rows = computed(() => buildRenderedBlockDiff(props.oldDoc, props.newDoc))
const changedRows = computed(() => rows.value.filter((row) => row.status !== 'unchanged'))
const visibleRows = computed(() => filter.value === 'changed' ? changedRows.value : rows.value)
const changedCount = computed(() => rows.value.filter((row) => row.status === 'changed').length)
const addedCount = computed(() => rows.value.filter((row) => row.status === 'added').length)
const removedCount = computed(() => rows.value.filter((row) => row.status === 'removed').length)
const hasAdvancedText = computed(() => Boolean(props.oldText || props.newText))

function toggleFilter() {
  filter.value = filter.value === 'all' ? 'changed' : 'all'
}

function toggleViewMode() {
  viewMode.value = viewMode.value === 'rendered' ? 'text' : 'rendered'
}
</script>

<style scoped>
.rendered-block-diff {
  --rendered-diff-added-bg: color-mix(in srgb, var(--pb-success, var(--pb-primary)) 13%, transparent);
  --rendered-diff-added-border: color-mix(in srgb, var(--pb-success, var(--pb-primary)) 42%, var(--pb-divider));
  --rendered-diff-removed-bg: color-mix(in srgb, var(--pb-danger, var(--pb-link)) 12%, transparent);
  --rendered-diff-removed-border: color-mix(in srgb, var(--pb-danger, var(--pb-link)) 38%, var(--pb-divider));
  --rendered-diff-changed-bg: color-mix(in srgb, var(--pb-warning, var(--pb-primary)) 15%, transparent);
  --rendered-diff-changed-border: color-mix(in srgb, var(--pb-warning, var(--pb-primary)) 40%, var(--pb-divider));
  overflow: hidden;
  background: var(--pb-card-bg);
  color: var(--pb-text);
}

.rendered-block-diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--pb-divider);
  background: var(--pb-surface-subtle);
  padding: 0.625rem 0.75rem;
}

.rendered-block-diff-title,
.rendered-block-diff-tools {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.4rem;
}

.rendered-block-diff-title {
  flex-wrap: wrap;
  font-size: 0.8rem;
  font-weight: 700;
}

.rendered-block-diff-icon,
.rendered-block-diff-arrow,
.rendered-block-diff-tool-icon,
.rendered-block-diff-empty-icon {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
}

.rendered-block-diff-arrow {
  color: var(--pb-text-subtle);
}

.rendered-block-diff-stat {
  border-radius: var(--pb-radius-sm);
  padding: 0.1rem 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
}

.rendered-block-diff-stat.is-changed {
  background: var(--rendered-diff-changed-bg);
  color: var(--pb-text);
}

.rendered-block-diff-stat.is-added {
  background: var(--rendered-diff-added-bg);
  color: var(--pb-text);
}

.rendered-block-diff-stat.is-removed {
  background: var(--rendered-diff-removed-bg);
  color: var(--pb-text);
}

.rendered-block-diff-tools {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.rendered-block-diff-tool {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid var(--pb-divider);
  border-radius: var(--pb-radius-sm);
  background: var(--pb-card-bg);
  padding: 0.25rem 0.45rem;
  color: var(--pb-text-muted);
  font-size: 0.75rem;
  line-height: 1;
}

.rendered-block-diff-tool.is-active {
  border-color: var(--pb-selected-border);
  background: var(--pb-selected-bg);
  color: var(--pb-text);
}

.rendered-block-diff-columns,
.rendered-block-diff-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.rendered-block-diff-columns {
  border-bottom: 1px solid var(--pb-divider);
  background: var(--pb-app-bg);
  color: var(--pb-text-muted);
  font-size: 0.75rem;
  font-weight: 700;
}

.rendered-block-diff-columns span {
  min-width: 0;
  padding: 0.5rem 0.75rem;
}

.rendered-block-diff-columns span + span {
  border-left: 1px solid var(--pb-divider);
}

.rendered-block-diff-body {
  display: grid;
  gap: 0;
}

.rendered-block-diff-row + .rendered-block-diff-row {
  border-top: 1px solid var(--pb-divider);
}

.rendered-block-diff-cell {
  min-width: 0;
  padding: 0.75rem;
}

.rendered-block-diff-cell + .rendered-block-diff-cell {
  border-left: 1px solid var(--pb-divider);
}

.rendered-block-diff-row.is-changed .rendered-block-diff-cell {
  background: var(--rendered-diff-changed-bg);
}

.rendered-block-diff-row.is-changed .rendered-block-diff-prose {
  border-color: var(--rendered-diff-changed-border);
}

.rendered-block-diff-row.is-added .rendered-block-diff-cell {
  background: var(--rendered-diff-added-bg);
}

.rendered-block-diff-row.is-added .rendered-block-diff-prose,
.rendered-block-diff-empty.is-added-space {
  border-color: var(--rendered-diff-added-border);
}

.rendered-block-diff-row.is-removed .rendered-block-diff-cell {
  background: var(--rendered-diff-removed-bg);
}

.rendered-block-diff-row.is-removed .rendered-block-diff-prose,
.rendered-block-diff-empty.is-removed-space {
  border-color: var(--rendered-diff-removed-border);
}

.rendered-block-diff-prose,
.rendered-block-diff-empty {
  min-height: 3rem;
  border: 1px solid transparent;
  border-radius: var(--pb-radius-card-inner);
  background: color-mix(in srgb, var(--pb-card-bg) 92%, transparent);
  padding: 0.75rem;
}

.rendered-block-diff-prose :deep(> :first-child) {
  margin-top: 0;
}

.rendered-block-diff-prose :deep(> :last-child) {
  margin-bottom: 0;
}

.rendered-block-diff-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  color: var(--pb-text-muted);
  font-size: 0.82rem;
  font-weight: 650;
}

.rendered-block-diff-none {
  padding: 1rem;
  color: var(--pb-text-muted);
  font-size: 0.875rem;
}

.rendered-block-diff-advanced {
  border-top: 1px solid var(--pb-divider);
}

.rendered-block-diff-advanced :deep(.diff-block) {
  margin: 0;
  border: 0;
  border-radius: 0;
}

@media (max-width: 48rem) {
  .rendered-block-diff-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .rendered-block-diff-tools {
    justify-content: flex-start;
  }

  .rendered-block-diff-columns,
  .rendered-block-diff-row {
    grid-template-columns: 1fr;
  }

  .rendered-block-diff-columns span + span,
  .rendered-block-diff-cell + .rendered-block-diff-cell {
    border-left: 0;
    border-top: 1px solid var(--pb-divider);
  }
}
</style>