<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="menuRef"
      class="block-actions-menu"
      :style="floatingStyles"
      role="menu"
      aria-label="Block actions"
      @keydown.escape="close"
    >
      <button
        v-for="item in menuItems"
        :key="item.id"
        class="block-actions-menu-item"
        :class="{ danger: item.danger }"
        role="menuitem"
        @click="handleAction(item.id)"
      >
        <UIcon :name="item.icon" class="size-4" />
        <span>{{ item.label }}</span>
        <kbd v-if="item.shortcut" class="ml-auto text-xs text-stone-400">{{ item.shortcut }}</kbd>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useFloating, offset, flip, shift } from '@floating-ui/vue'

const props = defineProps<{
  editor: any
  referenceEl: HTMLElement | null
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  action: [id: string]
}>()

const menuRef = ref<HTMLElement | null>(null)
const referenceRef = computed(() => props.referenceEl)

const { floatingStyles } = useFloating(referenceRef, menuRef, {
  placement: 'right-start',
  middleware: [offset(8), flip(), shift({ padding: 8 })]
})

interface MenuItem {
  id: string
  label: string
  icon: string
  shortcut?: string
  danger?: boolean
}

const menuItems: MenuItem[] = [
  { id: 'duplicate', label: 'Duplicate', icon: 'i-lucide-copy', shortcut: 'Ctrl+D' },
  { id: 'move-up', label: 'Move up', icon: 'i-lucide-arrow-up', shortcut: 'Ctrl+Shift+↑' },
  { id: 'move-down', label: 'Move down', icon: 'i-lucide-arrow-down', shortcut: 'Ctrl+Shift+↓' },
  { id: 'turn-into-paragraph', label: 'Paragraph', icon: 'i-lucide-type' },
  { id: 'turn-into-heading1', label: 'Heading 1', icon: 'i-lucide-heading-1' },
  { id: 'turn-into-heading2', label: 'Heading 2', icon: 'i-lucide-heading-2' },
  { id: 'turn-into-heading3', label: 'Heading 3', icon: 'i-lucide-heading-3' },
  { id: 'delete', label: 'Delete', icon: 'i-lucide-trash-2', danger: true }
]

function handleAction(id: string) {
  const ed = props.editor
  if (!ed) return

  switch (id) {
    case 'duplicate':
      duplicateBlock(ed)
      break
    case 'move-up':
      ed.commands.moveBlockUp?.()
      break
    case 'move-down':
      ed.commands.moveBlockDown?.()
      break
    case 'turn-into-paragraph':
      ed.chain().focus().setParagraph().run()
      break
    case 'turn-into-heading1':
      ed.chain().focus().setHeading({ level: 1 }).run()
      break
    case 'turn-into-heading2':
      ed.chain().focus().setHeading({ level: 2 }).run()
      break
    case 'turn-into-heading3':
      ed.chain().focus().setHeading({ level: 3 }).run()
      break
    case 'delete':
      deleteCurrentBlock(ed)
      break
  }

  emit('action', id)
  close()
}

function duplicateBlock(ed: any) {
  const { $from } = ed.state.selection
  let blockDepth = 0
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d - 1).type.name === 'doc') {
      blockDepth = d
      break
    }
  }
  if (blockDepth === 0) return

  const blockStart = $from.before(blockDepth)
  const blockEnd = $from.after(blockDepth)
  const blockContent = ed.state.doc.slice(blockStart, blockEnd)

  ed.chain()
    .focus()
    .insertContentAt(blockEnd, blockContent.content.toJSON())
    .run()
}

function deleteCurrentBlock(ed: any) {
  const { $from } = ed.state.selection
  let blockDepth = 0
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d - 1).type.name === 'doc') {
      blockDepth = d
      break
    }
  }
  if (blockDepth === 0) return

  const blockStart = $from.before(blockDepth)
  const blockEnd = $from.after(blockDepth)
  ed.chain().focus().deleteRange({ from: blockStart, to: blockEnd }).run()
}

function close() {
  emit('close')
}

// Close on click outside
function onClickOutside(event: MouseEvent) {
  if (!menuRef.value) return
  if (!menuRef.value.contains(event.target as Node)) {
    close()
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    nextTick(() => {
      document.addEventListener('mousedown', onClickOutside)
      // Focus first item for keyboard navigation
      const firstItem = menuRef.value?.querySelector('[role="menuitem"]') as HTMLElement
      firstItem?.focus()
    })
  } else {
    document.removeEventListener('mousedown', onClickOutside)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
})
</script>
