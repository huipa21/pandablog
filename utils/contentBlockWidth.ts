import type { CSSProperties } from 'vue'

export function contentBlockWidthStyle(value: unknown): CSSProperties {
  if (value === 'wide' || value === 'full-bleed') return {
    width: value === 'wide' ? 'min(120%, 72rem)' : '100vw',
    maxWidth: value === 'wide' ? 'calc(100vw - 2rem)' : '100vw',
    position: 'relative', left: '50%', transform: 'translateX(-50%)'
  }
  return { width: '100%', maxWidth: '100%' }
}
