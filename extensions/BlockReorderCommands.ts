import { Extension } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

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
 * top-level block with its sibling. After a move, the block receives a
 * "just-dropped" class for settlement animation.
 */
export const BlockReorderCommands = Extension.create({
  name: 'blockReorder',

  addCommands() {
    return {
      moveBlockUp:
        () =>
        ({ state, dispatch, tr }) => {
          const { $from } = state.selection
          const blockInfo = getTopLevelBlock($from)
          if (!blockInfo) return false

          const { blockStart, blockEnd, index, node } = blockInfo
          if (node.type.name === 'footnotesBlock') return false
          if (index === 0) return false // Already first block

          // Find previous sibling
          let prevStart = 0
          let prevEnd = 0
          let i = 0
          state.doc.forEach((node, offset) => {
            if (i === index - 1) {
              prevStart = offset
              prevEnd = offset + node.nodeSize
            }
            i++
          })

          if (!dispatch) return true

          // Swap: delete current block, insert before previous
          const blockSlice = state.doc.slice(blockStart, blockEnd)
          const newTr = tr
            .delete(blockStart, blockEnd)
            .insert(prevStart, blockSlice.content)

          // Maintain selection in the moved block
          const newPos = prevStart + 1
          newTr.setSelection(TextSelection.near(newTr.doc.resolve(newPos)))

          dispatch(newTr)
          markJustDropped(blockStart, prevStart)
          return true
        },

      moveBlockDown:
        () =>
        ({ state, dispatch, tr }) => {
          const { $from } = state.selection
          const blockInfo = getTopLevelBlock($from)
          if (!blockInfo) return false

          const { blockStart, blockEnd, index, node } = blockInfo
          if (node.type.name === 'footnotesBlock') return false
          if (index >= state.doc.childCount - 1) return false // Already last block

          // Find next sibling
          let nextStart = 0
          let nextEnd = 0
          let i = 0
          state.doc.forEach((node, offset) => {
            if (i === index + 1) {
              nextStart = offset
              nextEnd = offset + node.nodeSize
              if (node.type.name === 'footnotesBlock') {
                nextStart = -1
                nextEnd = -1
              }
            }
            i++
          })

          if (nextStart < 0 || nextEnd < 0) return false

          if (!dispatch) return true

          // Swap: delete next block, insert before current
          const nextSlice = state.doc.slice(nextStart, nextEnd)
          const newTr = tr
            .delete(nextStart, nextEnd)
            .insert(blockStart, nextSlice.content)

          // Maintain selection in the moved block (which is now at nextStart position)
          const newPos = blockStart + (nextEnd - nextStart) + 1
          newTr.setSelection(TextSelection.near(newTr.doc.resolve(Math.min(newPos, newTr.doc.content.size))))

          dispatch(newTr)
          markJustDropped(nextStart, blockStart + (nextEnd - nextStart))
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

function getTopLevelBlock($from: any) {
  let blockDepth = 0
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d - 1).type.name === 'doc') {
      blockDepth = d
      break
    }
  }
  if (blockDepth === 0) return null

  const blockStart = $from.before(blockDepth)
  const blockEnd = $from.after(blockDepth)

  // Determine index
  let index = -1
  let i = 0
  $from.doc.forEach((_node: any, offset: number) => {
    if (offset === blockStart) index = i
    i++
  })

  if (index < 0) return null
  return { blockStart, blockEnd, index, node: $from.node(blockDepth) }
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
