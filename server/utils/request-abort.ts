import type { H3Event } from 'h3'

/** Request-local cancellation; listeners are removed on response completion. */
export function requestAbortSignal(event: H3Event): AbortSignal {
  if (event.context.passwordWorkSignal) return event.context.passwordWorkSignal as AbortSignal
  const controller = new AbortController()
  const cleanup = () => {
    event.node.req.removeListener('aborted', abort)
    event.node.res.removeListener('close', close)
    event.node.res.removeListener('finish', cleanup)
  }
  const abort = () => controller.abort(new Error('Request aborted'))
  const close = () => { if (!event.node.res.writableEnded) abort(); cleanup() }
  event.node.req.once('aborted', abort)
  event.node.res.once('close', close)
  event.node.res.once('finish', cleanup)
  if (event.node.req.aborted || event.node.res.destroyed) abort()
  event.context.passwordWorkSignal = controller.signal
  return controller.signal
}
