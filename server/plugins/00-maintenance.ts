import { wrapMaintenanceHandler } from '../utils/maintenance-handler'
import { writeBarrier } from '../utils/maintenance'
import { jobStore } from '../utils/backups/jobMutex'
import { startup } from '../utils/startup'
import { drainPreviousDevWorker } from '../utils/dev-handoff'
import { validateStartupConfig } from '../utils/startup-config'
import { databaseConnectivityFailureCount, databaseDiagnostics, recycleRuntimeConnection, shutdownDb } from '../utils/db'

/** Install protection and shutdown participation synchronously: Nitro invokes
 * plugins without awaiting their returned promises. */
export default defineNitroPlugin((nitro) => {
  writeBarrier.observeUncertainty(() => jobStore.markUncertain())
  nitro.h3App.handler = wrapMaintenanceHandler(nitro.h3App.handler, writeBarrier, () => startup.guidance())
  nitro.hooks.hook('close', () => startup.stop())
  void startup.start({
    validate: validateStartupConfig,
    checkRestore: async () => {
      await drainPreviousDevWorker()
      if (startup.status().state === 'stopping') return false
      const safe = await jobStore.initializeRestoreState()
      writeBarrier.seedUncertainty(jobStore.maintenanceHoldUntil())
      return safe
    },
    connectivityFailures: databaseConnectivityFailureCount,
    resetDatabase: recycleRuntimeConnection,
    dispose: async () => {
      await shutdownDb()
      if (databaseDiagnostics().ownedClients) throw new Error('Database disposal is incomplete')
    }
  })
})
