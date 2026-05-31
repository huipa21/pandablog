<template>
  <div class="diff-block-shell" contenteditable="false">
    <div class="diff-block-header">
      <div class="diff-block-title">
        <UIcon name="i-lucide-git-compare-arrows" class="diff-block-icon" />
        <span class="diff-block-label">{{ oldLabelText }}</span>
        <UIcon name="i-lucide-arrow-right" class="diff-block-arrow" />
        <span class="diff-block-label">{{ newLabelText }}</span>
        <span class="diff-block-language">{{ languageLabel }}</span>
        <span class="diff-block-stat is-added">+{{ stats.added }}</span>
        <span class="diff-block-stat is-removed">-{{ stats.removed }}</span>
      </div>

      <div class="diff-block-toolbar" role="toolbar" aria-label="Diff controls">
        <button
          type="button"
          class="diff-block-tool"
          :class="mode === 'unified' ? 'is-active' : ''"
          :aria-pressed="mode === 'unified'"
          title="Unified view"
          @click="mode = 'unified'"
        >
          <UIcon name="i-lucide-list-tree" class="diff-block-tool-icon" />
          <span>Unified</span>
        </button>
        <button
          type="button"
          class="diff-block-tool"
          :class="mode === 'split' ? 'is-active' : ''"
          :aria-pressed="mode === 'split'"
          title="Split view"
          @click="mode = 'split'"
        >
          <UIcon name="i-lucide-columns-2" class="diff-block-tool-icon" />
          <span>Split</span>
        </button>
        <button
          type="button"
          class="diff-block-tool"
          :class="filter === 'changed' ? 'is-active' : ''"
          :aria-pressed="filter === 'changed'"
          title="Show changed lines with context"
          @click="toggleFilter"
        >
          <UIcon name="i-lucide-filter" class="diff-block-tool-icon" />
          <span>{{ filter === 'changed' ? 'Changed' : 'All' }}</span>
        </button>
        <button type="button" class="diff-block-tool" :title="copied ? 'Copied' : 'Copy diff'" @click="copyDiff">
          <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" class="diff-block-tool-icon" />
          <span>{{ copied ? 'Copied' : 'Copy' }}</span>
        </button>
      </div>
    </div>

    <div class="diff-block-body" :data-mode="mode" :data-filter="filter">
      <div v-if="mode === 'unified'" class="diff-unified" role="table" aria-label="Unified diff">
        <div
          v-for="row in visibleRows"
          :key="rowKey(row)"
          class="diff-row"
          :class="row.kind === 'line' ? `is-${row.line.type}` : 'is-hidden'"
          role="row"
        >
          <template v-if="row.kind === 'line'">
            <span class="diff-ln diff-ln-old" role="cell">{{ row.line.oldNumber ?? '' }}</span>
            <span class="diff-ln diff-ln-new" role="cell">{{ row.line.newNumber ?? '' }}</span>
            <span class="diff-sign" role="cell">{{ signFor(row.line.type) }}</span>
            <span class="diff-code" role="cell">{{ row.line.content || ' ' }}</span>
          </template>
          <button v-else type="button" class="diff-hidden-lines" @click="filter = 'all'">
            Show {{ row.count }} hidden unchanged {{ row.count === 1 ? 'line' : 'lines' }}
          </button>
        </div>
      </div>

      <div v-else class="diff-split" role="table" aria-label="Split diff">
        <div class="diff-split-head" role="row">
          <span>{{ oldLabelText }}</span>
          <span>{{ newLabelText }}</span>
        </div>
        <div
          v-for="row in visibleRows"
          :key="rowKey(row)"
          class="diff-split-row"
          :class="row.kind === 'line' ? `is-${row.line.type}` : 'is-hidden'"
          role="row"
        >
          <template v-if="row.kind === 'line'">
            <span class="diff-split-cell diff-old-cell" role="cell">
              <span class="diff-ln">{{ row.line.oldNumber ?? '' }}</span>
              <span class="diff-sign">{{ row.line.type === 'removed' ? '-' : ' ' }}</span>
              <span class="diff-code">{{ row.line.type === 'added' ? ' ' : row.line.content || ' ' }}</span>
            </span>
            <span class="diff-split-cell diff-new-cell" role="cell">
              <span class="diff-ln">{{ row.line.newNumber ?? '' }}</span>
              <span class="diff-sign">{{ row.line.type === 'added' ? '+' : ' ' }}</span>
              <span class="diff-code">{{ row.line.type === 'removed' ? ' ' : row.line.content || ' ' }}</span>
            </span>
          </template>
          <button v-else type="button" class="diff-hidden-lines" @click="filter = 'all'">
            Show {{ row.count }} hidden unchanged {{ row.count === 1 ? 'line' : 'lines' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DiffLine } from '~/utils/diffBlock'
import { buildDiffLines, diffLanguageLabel, diffStats } from '~/utils/diffBlock'

type DiffMode = 'unified' | 'split'
type DiffFilter = 'all' | 'changed'
type VisibleRow = { kind: 'line', index: number, line: DiffLine } | { kind: 'hidden', key: string, count: number }

const props = defineProps<{
  oldText: string
  newText: string
  language: string
  oldLabel: string
  newLabel: string
}>()

const CONTEXT_LINES = 3

const mode = ref<DiffMode>('unified')
const filter = ref<DiffFilter>('all')
const copied = ref(false)

const oldLabelText = computed(() => props.oldLabel.trim() || 'Before')
const newLabelText = computed(() => props.newLabel.trim() || 'After')
const languageLabel = computed(() => diffLanguageLabel(props.language))
const diffLines = computed(() => buildDiffLines(props.oldText, props.newText))
const stats = computed(() => diffStats(diffLines.value))

const visibleRows = computed<VisibleRow[]>(() => {
  if (filter.value === 'all') {
    return diffLines.value.map((line, index) => ({ kind: 'line', index, line }))
  }

  const changedIndexes = diffLines.value
    .map((line, index) => line.type === 'unchanged' ? -1 : index)
    .filter((index) => index >= 0)

  if (!changedIndexes.length) {
    return diffLines.value.map((line, index) => ({ kind: 'line', index, line }))
  }

  const visibleIndexes = new Set<number>()
  for (const index of changedIndexes) {
    const from = Math.max(0, index - CONTEXT_LINES)
    const to = Math.min(diffLines.value.length - 1, index + CONTEXT_LINES)
    for (let visibleIndex = from; visibleIndex <= to; visibleIndex += 1) {
      visibleIndexes.add(visibleIndex)
    }
  }

  const rows: VisibleRow[] = []
  let hiddenCount = 0
  for (let index = 0; index < diffLines.value.length; index += 1) {
    const line = diffLines.value[index]!
    if (!visibleIndexes.has(index)) {
      hiddenCount += 1
      continue
    }

    if (hiddenCount) {
      rows.push({ kind: 'hidden', key: `hidden-${index}-${hiddenCount}`, count: hiddenCount })
      hiddenCount = 0
    }
    rows.push({ kind: 'line', index, line })
  }

  if (hiddenCount) {
    rows.push({ kind: 'hidden', key: `hidden-tail-${hiddenCount}`, count: hiddenCount })
  }

  return rows
})

function toggleFilter() {
  filter.value = filter.value === 'all' ? 'changed' : 'all'
}

function signFor(type: DiffLine['type']) {
  if (type === 'added') return '+'
  if (type === 'removed') return '-'
  return ' '
}

function rowKey(row: VisibleRow) {
  return row.kind === 'hidden' ? row.key : row.line.id
}

async function copyDiff() {
  const text = diffLines.value
    .map((line) => `${signFor(line.type)}${line.content}`)
    .join('\n')

  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1500)
  } catch {
    copied.value = false
  }
}
</script>

<style>
.diff-block {
  --diff-add-bg: rgba(22, 163, 74, 0.12);
  --diff-add-strong: rgba(22, 163, 74, 0.2);
  --diff-del-bg: rgba(220, 38, 38, 0.12);
  --diff-del-strong: rgba(220, 38, 38, 0.2);
  --diff-gutter-bg: rgb(250 250 249);
  --diff-border: rgb(231 229 228);
  --diff-text: rgb(41 37 36);
  --diff-muted: rgb(120 113 108);
  --diff-bg: rgb(255 255 255);
  margin-block: 1rem;
  overflow: hidden;
  border: 1px solid var(--diff-border);
  border-radius: 0.5rem;
  background: var(--diff-bg);
  color: var(--diff-text);
}

[data-theme="dark"] .diff-block {
  --diff-add-bg: rgba(34, 197, 94, 0.14);
  --diff-add-strong: rgba(34, 197, 94, 0.24);
  --diff-del-bg: rgba(248, 113, 113, 0.14);
  --diff-del-strong: rgba(248, 113, 113, 0.24);
  --diff-gutter-bg: rgb(28 25 23);
  --diff-border: rgb(68 64 60);
  --diff-text: rgb(245 245 244);
  --diff-muted: rgb(168 162 158);
  --diff-bg: rgb(12 10 9);
}

.diff-block-shell {
  min-width: 0;
}

.diff-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--diff-border);
  background: var(--diff-gutter-bg);
}

.diff-block-title,
.diff-block-toolbar {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.4rem;
}

.diff-block-title {
  flex-wrap: wrap;
  font-size: 0.78rem;
  font-weight: 650;
}

.diff-block-icon,
.diff-block-arrow,
.diff-block-tool-icon {
  width: 0.9rem;
  height: 0.9rem;
  flex: 0 0 auto;
}

.diff-block-arrow {
  color: var(--diff-muted);
}

.diff-block-label {
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-block-language,
.diff-block-stat {
  display: inline-flex;
  align-items: center;
  min-height: 1.35rem;
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
  font-size: 0.68rem;
  line-height: 1;
  color: var(--diff-muted);
  background: rgba(127, 127, 127, 0.12);
}

.diff-block-stat.is-added {
  color: rgb(22 101 52);
  background: var(--diff-add-strong);
}

.diff-block-stat.is-removed {
  color: rgb(153 27 27);
  background: var(--diff-del-strong);
}

.diff-block-toolbar {
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.diff-block-tool {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid rgba(127, 127, 127, 0.25);
  border-radius: 0.3rem;
  padding: 0.15rem 0.4rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.68rem;
  line-height: 1;
}

.diff-block-tool:hover,
.diff-block-tool.is-active {
  background: rgba(127, 127, 127, 0.14);
}

.diff-block-body {
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
  font-size: 0.82rem;
  line-height: 1.55;
}

.diff-row,
.diff-split-row {
  min-width: max-content;
}

.diff-row {
  display: grid;
  grid-template-columns: 3.5rem 3.5rem 1.7rem minmax(28rem, 1fr);
}

.diff-row.is-added,
.diff-split-row.is-added .diff-new-cell {
  background: var(--diff-add-bg);
}

.diff-row.is-removed,
.diff-split-row.is-removed .diff-old-cell {
  background: var(--diff-del-bg);
}

.diff-ln,
.diff-sign {
  user-select: none;
  color: var(--diff-muted);
  background: var(--diff-gutter-bg);
}

.diff-ln {
  padding-inline: 0.65rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.diff-sign {
  text-align: center;
}

.diff-code {
  min-width: 0;
  padding-inline: 0.65rem 1rem;
  white-space: pre;
}

.diff-row.is-added .diff-sign,
.diff-split-row.is-added .diff-new-cell .diff-sign {
  color: rgb(22 101 52);
}

.diff-row.is-removed .diff-sign,
.diff-split-row.is-removed .diff-old-cell .diff-sign {
  color: rgb(153 27 27);
}

.diff-hidden-lines {
  grid-column: 1 / -1;
  width: 100%;
  border: 0;
  border-block: 1px solid var(--diff-border);
  padding: 0.3rem 0.75rem;
  background: rgba(127, 127, 127, 0.08);
  color: var(--diff-muted);
  cursor: pointer;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.72rem;
  text-align: center;
}

.diff-split-head {
  display: grid;
  grid-template-columns: minmax(24rem, 1fr) minmax(24rem, 1fr);
  min-width: 48rem;
  border-bottom: 1px solid var(--diff-border);
  background: var(--diff-gutter-bg);
  color: var(--diff-muted);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.72rem;
  font-weight: 650;
}

.diff-split-head span {
  padding: 0.35rem 0.75rem;
}

.diff-split-row {
  display: grid;
  grid-template-columns: minmax(24rem, 1fr) minmax(24rem, 1fr);
  min-width: 48rem;
}

.diff-split-cell {
  display: grid;
  grid-template-columns: 3.5rem 1.7rem minmax(18rem, 1fr);
  min-width: 0;
}

.diff-old-cell {
  border-right: 1px solid var(--diff-border);
}

@media (max-width: 760px) {
  .diff-block-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .diff-block-toolbar {
    justify-content: flex-start;
  }

  .diff-row {
    grid-template-columns: 2.7rem 2.7rem 1.4rem minmax(18rem, 1fr);
  }
}
</style>
