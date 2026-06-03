import { ADMIN_USERNAME, isSetupCompleted } from '../../utils/settings'

export default defineEventHandler(async () => {
  return {
    completed: await isSetupCompleted(),
    username: ADMIN_USERNAME
  }
})