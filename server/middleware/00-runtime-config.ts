import { normalizePublicRuntimeConfig } from '../utils/startup-config'

export default defineEventHandler(event => {
  // Invalid public settings must not break narrow fenced diagnostic paths.
  const pathname = event.path.split('?')[0]
  if (event.method === 'GET' && (pathname === '/api/health' || pathname === '/api/ready' || pathname === '/api/admin/backups/status' || pathname?.startsWith('/_nuxt/'))) return
  normalizePublicRuntimeConfig(useRuntimeConfig(event))
})
