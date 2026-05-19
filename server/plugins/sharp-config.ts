import sharp from 'sharp'

/**
 * Configure sharp for memory-constrained environments
 * - Limit concurrency to 1 to avoid memory spikes
 * - Disable cache to free memory between operations
 */
export default defineNitroPlugin(() => {
  sharp.concurrency(1)
  sharp.cache(false)
})
