import sharp from 'sharp'
import { imageAdmission } from '../utils/image-work'
import { mediaUploadBudget } from '../utils/media-upload'
import { mediaPublicationAdmission } from '../utils/media-publication'

/**
 * Configure sharp for memory-constrained environments
 * - Limit concurrency to 1 to avoid memory spikes
 * - Disable cache to free memory between operations
 */
export default defineNitroPlugin((nitroApp) => {
  sharp.concurrency(1)
  sharp.cache(false)
  nitroApp.hooks.hook('close', async () => {
    mediaUploadBudget.shutdown()
    await Promise.all([imageAdmission.shutdown(), mediaPublicationAdmission.shutdown()])
  })
})
