import { readPublicBootstrap } from '../../utils/publicBootstrap'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=120')
  return await readPublicBootstrap()
})