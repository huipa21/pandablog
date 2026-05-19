import { defineStore } from 'pinia'

interface SelectedEditorBlock {
  id: string
  type: string
  attrs: Record<string, unknown>
  pos: number
}

export const useEditorStore = defineStore('editor', () => {
  const selectedBlockId = ref<string | null>(null)
  const selectedBlockType = ref<string | null>(null)
  const selectedBlockAttrs = ref<Record<string, unknown>>({})
  const selectedBlockPos = ref<number | null>(null)
  const sidebarTab = ref<'post' | 'block'>('post')
  const inserterOpen = ref(false)

  function selectBlock(block: SelectedEditorBlock | null) {
    if (!block) {
      selectedBlockId.value = null
      selectedBlockType.value = null
      selectedBlockAttrs.value = {}
      selectedBlockPos.value = null
      return
    }

    selectedBlockId.value = block.id
    selectedBlockType.value = block.type
    selectedBlockAttrs.value = { ...block.attrs }
    selectedBlockPos.value = block.pos
    sidebarTab.value = 'block'
  }

  function mergeSelectedBlockAttrs(attrs: Record<string, unknown>) {
    selectedBlockAttrs.value = {
      ...selectedBlockAttrs.value,
      ...attrs
    }
  }

  function setSidebarTab(tab: 'post' | 'block') {
    sidebarTab.value = tab
  }

  function openInserter() {
    inserterOpen.value = true
  }

  function closeInserter() {
    inserterOpen.value = false
  }

  return {
    selectedBlockId,
    selectedBlockType,
    selectedBlockAttrs,
    selectedBlockPos,
    sidebarTab,
    inserterOpen,
    selectBlock,
    mergeSelectedBlockAttrs,
    setSidebarTab,
    openInserter,
    closeInserter
  }
})