import { waitForErrorGroupWrites } from '../utils/error-group-write'
import { flushPendingErrorGroups } from '../utils/logging'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('close', async () => {
    await flushPendingErrorGroups()
    await waitForErrorGroupWrites()
  })
})
