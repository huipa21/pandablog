import { Extension } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockReorder: {
      moveBlockUp: () => ReturnType
      moveBlockDown: () => ReturnType
    }
  }
}

/**
 * BlockReorderCommands extension.
 * Registers `moveBlockUp` and `moveBlockDown` commands that swap the current
 * active block with its sibling. After a move, the block receives a
 * "just-dropped" class for settlement animation.
 */
export const BlockReorderCommands = Extension.create({
  name: 'blockReorder',

  addCommands() {
    return {
      moveBlockUp:
        () =>
        ({ state, dispatch, tr }) => {
          const blockInfo = getCurrentSiblingBlock(state.selection)
          if (!blockInfo) return false

          const { blockStart, blockEnd, index, node, parent, parentStart } = blockInfo
          if (node.type.name === 'footnotesBlock') return false
          if (index === 0) return false // Already first block

          const previous = getChildRange(parent, parentStart, index - 1)
          if (!previous || previous.node.type.name === 'footnotesBlock') return false

          if (!dispatch) return true

          // Swap: delete current block, insert before previous
          const blockSlice = state.doc.slice(blockStart, blockEnd)
          const newTr = tr
            .delete(blockStart, blockEnd)
            .insert(previous.from, blockSlice.content)

          // Maintain selection in the moved block
          const newPos = previous.from + 1
          newTr.setSelection(TextSelection.near(newTr.doc.resolve(newPos)))

          dispatch(newTr)
          markJustDropped(blockStart, previous.from)
          return true
        },

      moveBlockDown:
        () =>
        ({ state, dispatch, tr }) => {
          const blockInfo = getCurrentSiblingBlock(state.selection)
          if (!blockInfo) return false

          const { blockStart, blockEnd, index, node, parent, parentStart } = blockInfo
          if (node.type.name === 'footnotesBlock') return false
          if (index >= parent.childCount - 1) return false // Already last block

          const next = getChildRange(parent, parentStart, index + 1)
          if (!next || next.node.type.name === 'footnotesBlock') return false

          if (!dispatch) return true

          // Swap: delete next block, insert before current
          const nextSlice = state.doc.slice(next.from, next.to)
          const newTr = tr
            .delete(next.from, next.to)
            .insert(blockStart, nextSlice.content)

          // Maintain selection in the moved block (which is now after the next sibling)
          const newPos = blockStart + (next.to - next.from) + 1
          newTr.setSelection(TextSelection.near(newTr.doc.resolve(Math.min(newPos, newTr.doc.content.size))))

          dispatch(newTr)
          markJustDropped(next.from, blockStart + (next.to - next.from))
          return true
        }
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-ArrowUp': () => this.editor.commands.moveBlockUp(),
      'Mod-Shift-ArrowDown': () => this.editor.commands.moveBlockDown()
    }
  }
})

const NESTED_BLOCK_ROOT_TYPES = new Set(['columnItem', 'tabPanel', 'accordionPane'])

interface SiblingBlockInfo {
  blockStart: number
  blockEnd: number
  index: number
  node: any
  parent: any
  parentStart: number
}

interface ChildRange {
  from: number
  to: number
  node: any
}

function getCurrentSiblingBlock(selection: any): SiblingBlockInfo | null {
  if (selection instanceof NodeSelection) {
    const parentDepth = selection.$from.depth
    const parent = selection.$from.parent
    const parentStart = parentDepth === 0 ? 0 : selection.$from.start(parentDepth)
    const index = selection.$from.index(parentDepth)

    return {
      blockStart: selection.from,
      blockEnd: selection.from + selection.node.nodeSize,
      index,
      node: selection.node,
      parent,
      parentStart
    }
  }

  const { $from } = selection
  let rootDepth = 0
  for (let depth = 1; depth <= $from.depth; depth += 1) {
    if (NESTED_BLOCK_ROOT_TYPES.has($from.node(depth).type.name)) {
      rootDepth = depth
    }
  }

  const blockDepth = rootDepth + 1
  if (blockDepth <= 0 || blockDepth > $from.depth) return null

  const parentDepth = blockDepth - 1
  const parent = $from.node(parentDepth)
  const parentStart = parentDepth === 0 ? 0 : $from.start(parentDepth)

  return {
    blockStart: $from.before(blockDepth),
    blockEnd: $from.after(blockDepth),
    index: $from.index(parentDepth),
    node: $from.node(blockDepth),
    parent,
    parentStart
  }
}

function getChildRange(parent: any, parentStart: number, targetIndex: number): ChildRange | null {
  let range: ChildRange | null = null

  parent.forEach((node: any, offset: number, index: number) => {
    if (index === targetIndex) {
      range = {
        from: parentStart + offset,
        to: parentStart + offset + node.nodeSize,
        node
      }
      return false
    }

    return undefined
  })

  return range
}

/**
 * Adds "just-dropped" class to the block element at the given position
 * for the settlement animation, then removes it after the animation completes.
 */
function markJustDropped(_oldPos: number, _newPos: number) {
  // Use requestAnimationFrame to wait for DOM update, then find the block element
  requestAnimationFrame(() => {
    const proseMirror = document.querySelector('.pandablog-block-editor .ProseMirror')
    if (!proseMirror) return

    // Find all top-level children and mark the recently moved one
    const children = Array.from(proseMirror.children) as HTMLElement[]
    // The moved block should already be in its new position after ProseMirror updates
    // We mark all blocks with a brief "just-dropped" class since we know one moved
    // A more precise approach would require mapping the transaction position to DOM
    children.forEach((child) => {
      if (child.classList.contains('just-dropped')) {
        child.classList.remove('just-dropped')
      }
    })

    // Small delay to ensure DOM has updated
    requestAnimationFrame(() => {
      // Re-query after DOM update
      const pm = document.querySelector('.pandablog-block-editor .ProseMirror')
      if (!pm) return
      // The focused block should be the moved one
      const sel = window.getSelection()
      if (sel && sel.focusNode) {
        let el: Node | null = sel.focusNode
        while (el && el.parentElement !== pm) {
          el = el.parentElement
        }
        if (el && el instanceof HTMLElement) {
          el.classList.add('just-dropped')
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          setTimeout(() => el.classList.remove('just-dropped'), 400)
        }
      }
    })
  })
}
