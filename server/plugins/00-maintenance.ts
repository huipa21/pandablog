import { wrapMaintenanceHandler } from '../utils/maintenance-handler'
import { writeBarrier } from '../utils/maintenance'
import { jobStore } from '../utils/backups/jobMutex'

/** The actual H3 handler promise owns the request lease, including errors and
 * disconnects. Releasing on socket close alone would race unfinished FS work. */
export default defineNitroPlugin(async (nitro) => {
  if (!await jobStore.startWriter()) writeBarrier.recoverFence()
  writeBarrier.observeUncertainty(() => jobStore.markUncertain())
  nitro.h3App.handler = wrapMaintenanceHandler(nitro.h3App.handler)
  nitro.hooks.hook('close', async () => {
    // An unfinished restore retains its journal/owner; shutdown must not
    // falsely imply success. Ordinary work gets a bounded drain before close.
    if (!writeBarrier.status().closed) await writeBarrier.close({}, 5_000).catch(() => {})
    if (!writeBarrier.status().active && !writeBarrier.status().uncertainWrites) await jobStore.stopWriter()
  })
})
