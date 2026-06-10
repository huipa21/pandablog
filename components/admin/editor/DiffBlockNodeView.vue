<template>
  <NodeViewWrapper
    class="diff-block my-4"
    data-type="diff-block"
    :data-language="language"
    :data-old-label="oldLabel"
    :data-new-label="newLabel"
    data-node-view-wrapper
    contenteditable="false"
  >
    <DiffBlockSurface
      :old-text="oldText"
      :new-text="newText"
      :language="language"
      :old-label="oldLabel"
      :new-label="newLabel"
    />

    <div v-if="selected" class="diff-editor-source" contenteditable="false">
      <div class="diff-editor-source-head">
        <span>{{ t('admin.editor.nodeViews.editDiffSource') }}</span>
        <span>{{ t('admin.editor.nodeViews.diffSourceDescription') }}</span>
      </div>
      <div class="diff-editor-source-grid">
        <label class="diff-editor-source-field">
          <span>{{ oldLabel || t('admin.editor.nodeViews.before') }}</span>
          <textarea
            :value="oldText"
            spellcheck="false"
            @input="updateOldText"
            @keydown.down="onArrowDown"
          />
        </label>
        <label class="diff-editor-source-field">
          <span>{{ newLabel || t('admin.editor.nodeViews.after') }}</span>
          <textarea
            :value="newText"
            spellcheck="false"
            @input="updateNewText"
            @keydown.down="onArrowDown"
          />
        </label>
      </div>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import DiffBlockSurface from '~/components/content/DiffBlockSurface.vue'
import {
  DEFAULT_DIFF_NEW_LABEL,
  DEFAULT_DIFF_NEW_TEXT,
  DEFAULT_DIFF_OLD_LABEL,
  DEFAULT_DIFF_OLD_TEXT,
  normalizeDiffLanguage
} from '~/utils/diffBlock'

const props = defineProps(nodeViewProps)
const { t } = useI18n()

const oldText = computed(() => typeof props.node.attrs.oldText === 'string' ? props.node.attrs.oldText : DEFAULT_DIFF_OLD_TEXT)
const newText = computed(() => typeof props.node.attrs.newText === 'string' ? props.node.attrs.newText : DEFAULT_DIFF_NEW_TEXT)
const language = computed(() => normalizeDiffLanguage(props.node.attrs.language))
const oldLabel = computed(() => typeof props.node.attrs.oldLabel === 'string' ? props.node.attrs.oldLabel : DEFAULT_DIFF_OLD_LABEL)
const newLabel = computed(() => typeof props.node.attrs.newLabel === 'string' ? props.node.attrs.newLabel : DEFAULT_DIFF_NEW_LABEL)

const selected = computed(() => Boolean(props.selected))

function onArrowDown(event: KeyboardEvent) {
  const t = event.target as HTMLTextAreaElement
  if (t.value.slice(t.selectionEnd).includes('\n')) return
  event.preventDefault()
  const pos = typeof props.getPos === 'function' ? props.getPos() : undefined
  if (pos === undefined) return
  const after = pos + props.node.nodeSize
  const docSize = props.editor.state.doc.content.size
  props.editor.chain().focus().setTextSelection(Math.min(after + 1, docSize - 1)).run()
}

function updateOldText(event: Event) {
  props.updateAttributes({ oldText: (event.target as HTMLTextAreaElement).value })
}

function updateNewText(event: Event) {
  props.updateAttributes({ newText: (event.target as HTMLTextAreaElement).value })
}
</script>

<style scoped>
.diff-editor-source {
  margin-top: 0.75rem;
  border: 1px solid rgb(214 211 209);
  border-radius: 0.5rem;
  background: rgb(250 250 249);
  box-shadow: 0 18px 40px rgba(41, 37, 36, 0.12);
  overflow: hidden;
}

.diff-editor-source-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid rgb(231 229 228);
  padding: 0.55rem 0.75rem;
  color: rgb(68 64 60);
  font-size: 0.75rem;
}

.diff-editor-source-head span:first-child {
  color: rgb(28 25 23);
  font-weight: 650;
}

.diff-editor-source-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  padding: 0.75rem;
}

.diff-editor-source-field {
  display: grid;
  min-width: 0;
  gap: 0.4rem;
  color: rgb(68 64 60);
  font-size: 0.75rem;
  font-weight: 650;
}

.diff-editor-source-field textarea {
  width: 100%;
  min-height: 14rem;
  resize: vertical;
  border: 1px solid rgb(214 211 209);
  border-radius: 0.375rem;
  background: white;
  color: rgb(28 25 23);
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.82rem;
  line-height: 1.45;
  padding: 0.65rem;
  outline: none;
}

.diff-editor-source-field textarea:focus {
  border-color: rgb(20 184 166);
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.16);
}

@media (max-width: 760px) {
  .diff-editor-source-grid {
    grid-template-columns: 1fr;
  }

  .diff-editor-source-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.25rem;
  }
}
</style>
