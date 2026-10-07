import { startup } from '../utils/startup'

// DB disposal is coordinated after startup and lease drain, not a parallel
// close hook that could race privileged initialization or release ownership.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('close', () => startup.stop())
})
