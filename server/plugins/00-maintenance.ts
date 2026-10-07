import { wrapMaintenanceHandler } from '../utils/maintenance-handler'
import { writeBarrier } from '../utils/maintenance'
import { jobStore } from '../utils/backups/jobMutex'
import { startup } from '../utils/startup'
import { validateStartupConfig } from '../utils/startup-config'
import { databaseDiagnostics, isPreMutationInitializationFailure, shutdownDb } from '../utils/db'

/** Install protection and shutdown participation synchronously: Nitro invokes
 * plugins without awaiting their returned promises. */
export default defineNitroPlugin((nitro) => {
  writeBarrier.observeUncertainty(() => jobStore.markUncertain())
  nitro.h3App.handler = wrapMaintenanceHandler(nitro.h3App.handler, writeBarrier, () => startup.guidance())
  nitro.hooks.hook('close', () => startup.stop())
  void startup.start({
    validate: validateStartupConfig,
    acquireWriter: () => process.env.NODE_ENV === 'development'
      ? jobStore.startWriterAfterDevDrain(() => startup.status().state === 'stopping')
      : jobStore.startWriter(),
    preserveFailure: () => jobStore.markUncertain(),
    isPreMutationFailure: isPreMutationInitializationFailure,
    releaseWriter: async () => {
      if (!await jobStore.stopWriter()) throw new Error('Writer release could not be verified')
    },
    dispose: async () => {
      await shutdownDb()
      if (databaseDiagnostics().ownedClients) throw new Error('Database disposal is incomplete')
    }
  })
})
