import { validateMutationOrigin } from '../middleware/api-origin'

export default defineNitroPlugin(() => {
  if (process.env.NODE_ENV === 'production') validateMutationOrigin(useRuntimeConfig().appOrigin)
})
