import { readPublicBootstrap } from '../../utils/publicBootstrap'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-cache, max-age=0, must-revalidate')
  return await readPublicBootstrap()
})