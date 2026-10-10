import { ensureRequestId } from '../utils/request-id'

export default defineEventHandler((event) => {
  ensureRequestId(event)
})
