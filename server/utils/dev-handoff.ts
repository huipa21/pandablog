import { createHash, randomBytes } from 'node:crypto'
import { BroadcastChannel, isMainThread } from 'node:worker_threads'
import { BACKUPS_ROOT } from './backups/config'
import { startup } from './startup'

/** Installed Nitro briefly overlaps dev Workers. Coordinate ONLY their
 * in-process lifecycles; forced termination leaves no persistent authority.
 * A live undrained worker refuses the replacement rather than TTL stealing. */
export async function drainPreviousDevWorker(): Promise<void> {
  if (process.env.NODE_ENV !== 'development' || isMainThread) return
  const channel = new BroadcastChannel(`pandablog-dev-${createHash('sha256').update(BACKUPS_ROOT).digest('hex')}`)
  channel.unref()
  const id = randomBytes(16).toString('hex'), started = Date.now()
  const pending = new Set<string>()
  channel.onmessage = event => {
    const message = event.data as {type?: string, id?: string, target?: string, started?: number}
    if (!message || typeof message.id !== 'string') return
    if (message.type === 'hello' && (Number(message.started) > started || (message.started === started && message.id > id))) {
      channel.postMessage({type: 'draining', id, target: message.id})
      void startup.stop().then(() => {
        if (startup.shutdownDrained()) channel.postMessage({type: 'released', id, target: message.id})
      }).catch(() => {})
    }
    if (message.target !== id) return
    if (message.type === 'draining') pending.add(message.id)
    if (message.type === 'released') pending.delete(message.id)
  }
  channel.postMessage({type: 'hello', id, started})
  // Allow live incumbents to respond; a terminated Worker has no channel.
  await new Promise(resolve => setTimeout(resolve, 100))
  const deadline = Date.now() + 15_000
  while (pending.size && Date.now() < deadline && startup.status().state !== 'stopping') await new Promise(resolve => setTimeout(resolve, 25))
  if (pending.size) {channel.close(); throw new Error('Previous dev worker did not drain within the lifecycle bound')}
  // Keep the unreferenced listener for the NEXT replacement. Worker disposal
  // closes it; it never owns storage or imposes a production startup wait.
}
