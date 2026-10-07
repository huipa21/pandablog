/** Canonical values are authoritative, including explicitly empty strings.
 * Nuxt may copy file values into process.env before config evaluation; their
 * provenance is then indistinguishable, but canonical dominance is unchanged. */
export function resolveEnvironment(
  canonical: string, local: Record<string, string | undefined>,
  processEnv: Record<string, string | undefined>, fallback = ''
): string {
  return processEnv[canonical] ?? local[canonical] ?? fallback
}

export function parseEnvironmentBoolean(value: unknown, name = 'NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY'): boolean {
  if (typeof value === 'boolean') return value
  if (value === undefined) return false
  if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1
  if (typeof value === 'string') {
    switch (value.trim().toLowerCase()) {
      case 'true': case '1': case 'yes': case 'on': return true
      case 'false': case '0': case 'no': case 'off': return false
    }
  }
  // Names only: never echo the supplied value (even for public config).
  throw new Error(`${name} must be a supported boolean (true/false)`)
}

export function footerPoweredBy(configured: unknown, env: Record<string, string | undefined>): boolean {
  return parseEnvironmentBoolean(env.NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY ?? configured)
}
