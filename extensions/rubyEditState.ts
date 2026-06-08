import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { DEFAULT_ANNOT_LANG, isAnnotLang, type AnnotLang } from './rubyUnit'

/**
 * Selection-aware editing state for annotation blocks.
 *
 * Holds:
 *  - the multi-selection of `rubyUnit` atoms within a single annotation block
 *  - the position of the currently-open inline popover (one at a time, globally)
 *  - the "pending re-annotation" text range left behind after the user strips
 *    selected rubies (visualised so the user knows what will be re-fed to the
 *    engine on the next click)
 *
 * The state lives in a ProseMirror plugin so every NodeView and the block
 * toolbar see the same source of truth. Positions are remapped on every
 * transaction via `tr.mapping`, so document edits keep selections coherent
 * without a stable atom key.
 */

export interface RubyPendingRange {
  from: number
  to: number
  lang: AnnotLang
}

export interface RubyEditState {
  blockPos: number | null
  selectedPositions: number[]
  anchorPosition: number | null
  openPopoverPos: number | null
  pendingRange: RubyPendingRange | null
}

export const RUBY_EDIT_META = 'rubyEdit'
export const rubyEditPluginKey = new PluginKey<RubyEditState>('rubyEditState')

interface RubyEditMeta {
  type: 'set-multi' | 'toggle' | 'range' | 'clear-multi' | 'set-popover' | 'set-pending' | 'reset'
  positions?: number[]
  position?: number | null
  blockPos?: number | null
  anchor?: number | null
  pending?: RubyPendingRange | null
}

const initialState: RubyEditState = {
  blockPos: null,
  selectedPositions: [],
  anchorPosition: null,
  openPopoverPos: null,
  pendingRange: null
}

function isAnnotationBlockAt(state: EditorState, pos: number | null): boolean {
  if (pos === null) return false
  const node = state.doc.nodeAt(pos)
  return node?.type.name === 'annotationBlock'
}

function findEnclosingAnnotationBlock(state: EditorState, pos: number): number | null {
  // Walk up the document to find an annotationBlock ancestor of `pos`.
  const $pos = state.doc.resolve(Math.min(Math.max(pos, 0), state.doc.content.size))
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth)
    if (node.type.name === 'annotationBlock') {
      return depth === 0 ? 0 : $pos.before(depth)
    }
  }
  return null
}

function applyMetaChange(state: RubyEditState, meta: RubyEditMeta): RubyEditState {
  switch (meta.type) {
    case 'reset':
      return { ...initialState }
    case 'clear-multi':
      return {
        ...state,
        selectedPositions: [],
        anchorPosition: null
      }
    case 'set-multi': {
      const positions = (meta.positions ?? []).slice().sort((a, b) => a - b)
      return {
        ...state,
        blockPos: meta.blockPos ?? state.blockPos,
        selectedPositions: positions,
        anchorPosition: meta.anchor ?? (positions.length === 1 ? (positions[0] ?? null) : state.anchorPosition),
        openPopoverPos: null,
        pendingRange: positions.length > 0 ? null : state.pendingRange
      }
    }
    case 'toggle': {
      if (meta.position === undefined || meta.position === null) return state
      const target = meta.position
      const blockPos = meta.blockPos ?? state.blockPos
      // Switching block scope clears previous selection.
      const base = blockPos !== state.blockPos ? [] : state.selectedPositions
      const exists = base.includes(target)
      const next = exists ? base.filter((pos) => pos !== target) : [...base, target]
      next.sort((a, b) => a - b)
      return {
        ...state,
        blockPos,
        selectedPositions: next,
        anchorPosition: target,
        openPopoverPos: null,
        pendingRange: next.length > 0 ? null : state.pendingRange
      }
    }
    case 'range': {
      const positions = (meta.positions ?? []).slice().sort((a, b) => a - b)
      return {
        ...state,
        blockPos: meta.blockPos ?? state.blockPos,
        selectedPositions: positions,
        anchorPosition: state.anchorPosition,
        openPopoverPos: null,
        pendingRange: positions.length > 0 ? null : state.pendingRange
      }
    }
    case 'set-popover':
      return {
        ...state,
        openPopoverPos: meta.position ?? null
      }
    case 'set-pending':
      return {
        ...state,
        selectedPositions: meta.pending ? [] : state.selectedPositions,
        anchorPosition: meta.pending ? null : state.anchorPosition,
        openPopoverPos: meta.pending ? null : state.openPopoverPos,
        pendingRange: meta.pending ?? null
      }
    default:
      return state
  }
}

function remapState(state: RubyEditState, tr: Transaction): RubyEditState {
  const mapping = tr.mapping
  const remappedSelected: number[] = []
  for (const pos of state.selectedPositions) {
    const mapped = mapping.mapResult(pos)
    if (mapped.deleted) continue
    remappedSelected.push(mapped.pos)
  }
  remappedSelected.sort((a, b) => a - b)

  const remappedAnchor = state.anchorPosition === null
    ? null
    : (() => {
        const r = mapping.mapResult(state.anchorPosition)
        return r.deleted ? null : r.pos
      })()

  const remappedPopover = state.openPopoverPos === null
    ? null
    : (() => {
        const r = mapping.mapResult(state.openPopoverPos)
        return r.deleted ? null : r.pos
      })()

  const remappedBlock = state.blockPos === null
    ? null
    : (() => {
        const r = mapping.mapResult(state.blockPos)
        return r.deleted ? null : r.pos
      })()

  const remappedPending = state.pendingRange === null
    ? null
    : (() => {
        const fromRes = mapping.mapResult(state.pendingRange.from)
        const toRes = mapping.mapResult(state.pendingRange.to)
        if (fromRes.deleted || toRes.deleted) return null
        if (toRes.pos <= fromRes.pos) return null
        return { from: fromRes.pos, to: toRes.pos, lang: state.pendingRange.lang }
      })()

  return {
    blockPos: remappedBlock,
    selectedPositions: remappedSelected,
    anchorPosition: remappedAnchor,
    openPopoverPos: remappedPopover,
    pendingRange: remappedPending
  }
}

function ensureBlockValid(state: RubyEditState, editorState: EditorState): RubyEditState {
  if (state.blockPos !== null && !isAnnotationBlockAt(editorState, state.blockPos)) {
    return { ...initialState }
  }
  return state
}

function buildDecorations(state: RubyEditState, doc: EditorState['doc']): DecorationSet {
  const decorations: Decoration[] = []
  for (const pos of state.selectedPositions) {
    const node = doc.nodeAt(pos)
    if (!node) continue
    if (node.type.name !== 'rubyUnit') continue
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, { class: 'ruby-multi-selected' })
    )
  }
  if (state.pendingRange) {
    const { from, to } = state.pendingRange
    if (from < to && to <= doc.content.size) {
      decorations.push(
        Decoration.inline(from, to, { class: 'ruby-pending-annotation' })
      )
    }
  }
  return DecorationSet.create(doc, decorations)
}

export const RubyEditExtension = Extension.create({
  name: 'rubyEditState',

  addProseMirrorPlugins() {
    return [
      new Plugin<RubyEditState>({
        key: rubyEditPluginKey,
        state: {
          init: () => ({ ...initialState }),
          apply: (tr, prev, _oldState, newState) => {
            // 1) Remap positions through the transaction.
            let next = remapState(prev, tr)

            // 2) Apply explicit meta from helper functions.
            const meta = tr.getMeta(rubyEditPluginKey) as RubyEditMeta | undefined
            if (meta) {
              next = applyMetaChange(next, meta)
            }

            // 3) If a doc-changing transaction without a meta touched the block
            //    (e.g. the user typed text), drop transient multi-selection so
            //    we don't act on stale UI state. Keep the popover open when it
            //    still points at a rubyUnit: editing the popover's input updates
            //    the ruby attrs via a doc-changing transaction, and closing here
            //    makes the input flash away after the first character.
            if (!meta && tr.docChanged) {
              const keepPopover = next.openPopoverPos !== null
                && newState.doc.nodeAt(next.openPopoverPos)?.type.name === 'rubyUnit'
              next = {
                ...next,
                selectedPositions: [],
                anchorPosition: null,
                openPopoverPos: keepPopover ? next.openPopoverPos : null
              }
            }

            // 4) Validate that the recorded block still exists.
            next = ensureBlockValid(next, newState)

            return next
          }
        },
        props: {
          decorations(this: Plugin<RubyEditState>, state) {
            const value = this.getState(state)
            if (!value) return null
            return buildDecorations(value, state.doc)
          },
          handleKeyDown(view, event) {
            if (event.key === 'Escape') {
              const value = rubyEditPluginKey.getState(view.state)
              if (!value) return false
              const hasState =
                value.selectedPositions.length > 0 ||
                value.openPopoverPos !== null ||
                value.pendingRange !== null
              if (!hasState) return false
              view.dispatch(view.state.tr.setMeta(rubyEditPluginKey, { type: 'reset' } satisfies RubyEditMeta))
              return true
            }
            return false
          },
          handleClick(view, _pos, event) {
            // Click outside any ruby-unit clears multi-selection / popover.
            const target = event.target as HTMLElement | null
            if (!target) return false
            const inRuby = target.closest('.ruby-unit-nodeview')
            if (inRuby) return false
            const value = rubyEditPluginKey.getState(view.state)
            if (!value) return false
            if (value.selectedPositions.length === 0 && value.openPopoverPos === null) return false
            view.dispatch(view.state.tr.setMeta(rubyEditPluginKey, {
              type: 'set-multi',
              positions: [],
              anchor: null,
              blockPos: value.blockPos
            } satisfies RubyEditMeta))
            return false
          }
        },
        appendTransaction(transactions, _oldState, newState) {
          // Auto-clear pendingRange when the editor's main selection moves
          // outside it (the user navigated away — they no longer intend to
          // re-annotate). Done via appendTransaction so the plugin state's
          // own apply() is not racing with itself.
          //
          // Important: only clear when the selection EXPLICITLY moved this
          // tick (`tr.selectionSet`). Otherwise setting `pendingRange` from
          // outside (where the editor selection happens to be elsewhere,
          // e.g. on a toolbar button) would immediately clear it.
          const value = rubyEditPluginKey.getState(newState)
          if (!value || !value.pendingRange) return null
          const selectionMoved = transactions.some((tr) => tr.selectionSet)
          if (!selectionMoved) return null
          const sel = newState.selection
          if (!(sel instanceof TextSelection)) return null
          const { from, to } = value.pendingRange
          if (sel.from >= from && sel.to <= to) return null
          return newState.tr.setMeta(rubyEditPluginKey, { type: 'set-pending', pending: null } satisfies RubyEditMeta)
        }
      })
    ]
  }
})

// ---------- Helper API ----------

export function getRubyEditState(state: EditorState): RubyEditState {
  return rubyEditPluginKey.getState(state) ?? { ...initialState }
}

export function setMultiSelection(view: EditorView, positions: number[], anchor: number | null, blockPos: number | null) {
  view.dispatch(view.state.tr.setMeta(rubyEditPluginKey, {
    type: 'set-multi',
    positions,
    anchor,
    blockPos
  } satisfies RubyEditMeta))
}

export function togglePosition(view: EditorView, position: number, blockPos: number | null) {
  view.dispatch(view.state.tr.setMeta(rubyEditPluginKey, {
    type: 'toggle',
    position,
    blockPos
  } satisfies RubyEditMeta))
}

export function clearMultiSelection(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(rubyEditPluginKey, { type: 'clear-multi' } satisfies RubyEditMeta))
}

export function setOpenPopover(view: EditorView, position: number | null) {
  view.dispatch(view.state.tr.setMeta(rubyEditPluginKey, {
    type: 'set-popover',
    position
  } satisfies RubyEditMeta))
}

export function setPendingRange(view: EditorView, pending: RubyPendingRange | null) {
  view.dispatch(view.state.tr.setMeta(rubyEditPluginKey, {
    type: 'set-pending',
    pending
  } satisfies RubyEditMeta))
}

/**
 * Compute the set of ruby positions inside the same annotation block as
 * `blockPos`, between (inclusive) `anchor` and `target`. Used by Shift+click.
 */
export function collectRangePositions(state: EditorState, blockPos: number, anchor: number, target: number): number[] {
  const block = state.doc.nodeAt(blockPos)
  if (!block || block.type.name !== 'annotationBlock') return []
  const min = Math.min(anchor, target)
  const max = Math.max(anchor, target)
  const positions: number[] = []
  // Children of an annotationBlock are inline; their offsets are relative
  // to the block start. Absolute pos of child i = blockPos + 1 + offset.
  block.forEach((child, offset) => {
    if (child.type.name !== 'rubyUnit') return
    const absPos = blockPos + 1 + offset
    if (absPos >= min && absPos <= max) {
      positions.push(absPos)
    }
  })
  return positions
}

/**
 * Resolve the absolute position of an annotation block by walking up from a
 * ruby atom's position. Returns `null` if the ruby is somehow not inside an
 * annotation block (defensive — current schema requires it).
 */
export function findRubyOwnerBlock(state: EditorState, rubyPos: number): number | null {
  return findEnclosingAnnotationBlock(state, rubyPos)
}

export function clampLang(value: unknown): AnnotLang {
  return isAnnotLang(value) ? value : DEFAULT_ANNOT_LANG
}
