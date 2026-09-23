import { requireAdminTier } from '../../../utils/auth'

/**
 * Build identity for the admin UI.
 *
 * Admin-gated on purpose: publishing the exact build of a public site lets an
 * attacker match it against known vulnerabilities. The same value is available
 * inside the container via `panda version`.
 */
export default defineEventHandler(async (event) => {
  await requireAdminTier(event)

  const version = useRuntimeConfig(event).appVersion || ''
  const [, date, sequence, shortSha] = /^(\d{6})-(\d+)\+g([0-9a-f]{7,40})/.exec(version) ?? []

  return {
    version,
    date: date ?? null,
    sequence: sequence ? Number(sequence) : null,
    commit: shortSha ?? null,
    dirty: version.endsWith('.dirty'),
    node: process.version
  }
})
