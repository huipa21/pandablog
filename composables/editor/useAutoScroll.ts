/**
 * Auto-scroll composable for block drag-and-drop.
 * Scrolls the viewport (or a custom container) when the pointer approaches
 * the top or bottom edge during a drag operation.
 *
 * Speed is eased using easeInQuad so the scroll starts gently and accelerates
 * as the pointer moves deeper into the trigger zone.
 */
export function useAutoScroll(options?: {
  /** CSS selector for scroll container. Defaults to window scrolling. */
  container?: string
  /** Height of the trigger zone in px (default: 100) */
  triggerZone?: number
  /** Max speed in px/frame at 60fps (default: 18) */
  maxSpeed?: number
}) {
  const triggerZone = options?.triggerZone ?? 100
  const maxSpeed = options?.maxSpeed ?? 18

  let rafId: number | null = null
  let active = false
  let pointerY = 0

  function getScrollContainer(): Element | null {
    if (!options?.container) return null
    return document.querySelector(options.container)
  }

  function easeInQuad(t: number): number {
    return t * t
  }

  function tick() {
    if (!active) return

    const container = getScrollContainer()
    const viewportHeight = container
      ? container.getBoundingClientRect().height
      : window.innerHeight
    const scrollTop = container ? container.scrollTop : window.scrollY
    const containerTop = container
      ? container.getBoundingClientRect().top
      : 0

    const relativeY = pointerY - containerTop

    let speed = 0

    if (relativeY < triggerZone) {
      // Near top edge — scroll up
      const distance = triggerZone - relativeY
      const ratio = Math.min(distance / triggerZone, 1)
      speed = -(maxSpeed * easeInQuad(ratio))
    } else if (relativeY > viewportHeight - triggerZone) {
      // Near bottom edge — scroll down
      const distance = relativeY - (viewportHeight - triggerZone)
      const ratio = Math.min(distance / triggerZone, 1)
      speed = maxSpeed * easeInQuad(ratio)
    }

    if (speed !== 0) {
      if (container) {
        container.scrollTop = scrollTop + speed
      } else {
        window.scrollBy(0, speed)
      }
    }

    rafId = requestAnimationFrame(tick)
  }

  function start() {
    if (active) return
    active = true
    rafId = requestAnimationFrame(tick)
  }

  function stop() {
    active = false
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  function updatePointer(event: DragEvent | MouseEvent) {
    pointerY = event.clientY
  }

  onBeforeUnmount(() => {
    stop()
  })

  return {
    start,
    stop,
    updatePointer
  }
}
