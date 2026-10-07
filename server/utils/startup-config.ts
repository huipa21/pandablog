import { footerPoweredBy } from '../../utils/runtimeEnvironment'
import { validateMutationOrigin } from './application-origin'

interface DatabaseConfig {
  surrealUrl?: unknown, surrealNamespace?: unknown, surrealDatabase?: unknown,
  surrealRoot?: unknown, surrealRootPassword?: unknown, surrealAppUser?: unknown, surrealAppPassword?: unknown
}
function required(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !value.length) throw new Error(`${name} is required`)
}
export function scopedCredentials(config: DatabaseConfig) {
  const username = typeof config.surrealAppUser === 'string' ? config.surrealAppUser.trim() : ''
  const password = config.surrealAppPassword
  if (!username || typeof password !== 'string' || !password.length) {
    throw Object.assign(new Error('Both valid scoped SurrealDB runtime credentials are required (NUXT_SURREAL_APP_USER / NUXT_SURREAL_APP_PASSWORD)'), {
      data: {kind: 'startup-configuration', reason: 'missing-scoped-credentials'}
    })
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(username)) {
    throw Object.assign(new Error('Invalid scoped SurrealDB runtime credentials: NUXT_SURREAL_APP_USER must start with a letter or underscore and contain only letters, digits or underscores (no hyphens)'), {
      data: {kind: 'startup-configuration', reason: 'invalid-scoped-username'}
    })
  }
  return {username, password}
}

/** ROOT is an explicit bootstrap/maintenance identity, not a runtime fallback.
 * With no password configured, normal startup uses an already-provisioned user. */
export function bootstrapCredentials(config: DatabaseConfig) {
  if (config.surrealRootPassword === undefined || config.surrealRootPassword === '') return undefined
  return rootCredentials(config)
}
export function rootCredentials(config: DatabaseConfig) {
  const username = typeof config.surrealRoot === 'string' ? config.surrealRoot.trim() : ''
  const password = config.surrealRootPassword
  if (!username || typeof password !== 'string' || !password.length) throw new Error('ROOT credentials are required for explicit bootstrap or privileged maintenance')
  return {username, password}
}
export function databaseIdentifier(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(value)) throw new Error(`${name} must be a supported database identifier`)
  return '`' + value + '`'
}

export function validateStartupConfig() {
  const config = useRuntimeConfig()
  scopedCredentials(config)
  for (const [key, name] of [
    ['surrealUrl', 'NUXT_SURREAL_URL'], ['surrealNamespace', 'NUXT_SURREAL_NAMESPACE'],
    ['surrealDatabase', 'NUXT_SURREAL_DATABASE']
  ] as const) required(config[key], name)
  databaseIdentifier(config.surrealNamespace, 'NUXT_SURREAL_NAMESPACE')
  databaseIdentifier(config.surrealDatabase, 'NUXT_SURREAL_DATABASE')
  bootstrapCredentials(config)
  try {
    const url = new URL(config.surrealUrl)
    if (!['ws:', 'wss:', 'http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error()
  } catch {throw new Error('NUXT_SURREAL_URL must be a database endpoint without embedded credentials')}
  required(config.session.password, 'NUXT_SESSION_PASSWORD')
  if (config.session.password.length < 32) throw new Error('NUXT_SESSION_PASSWORD must contain 32+ characters')
  if (config.appOrigin || process.env.NODE_ENV === 'production') validateMutationOrigin(config.appOrigin)
  footerPoweredBy(config.public.footerShowPoweredBy, process.env)
}

/** Nitro's shared config is frozen; normalize only the per-event clone before
 * Nuxt serializes public config to SSR/client payloads. */
export function normalizePublicRuntimeConfig(config: {public: {footerShowPoweredBy?: unknown}}) {
  config.public.footerShowPoweredBy = footerPoweredBy(config.public.footerShowPoweredBy, process.env)
}
