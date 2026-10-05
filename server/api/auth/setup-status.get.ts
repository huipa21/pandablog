import { ADMIN_USERNAME } from '../../utils/settings'
import { useDb } from '../../utils/db'
import { setupAuthority } from '../../utils/setup-authority'

export default defineEventHandler(async () => {
  return {
    ...await setupAuthority().status(await useDb()),
    username: ADMIN_USERNAME
  }
})