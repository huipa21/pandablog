import { defineNuxtModule } from '@nuxt/kit'
import { formatLegacyManifestWarning, inspectLegacyModuleManifest } from '../build/legacy-module-manifest'

// Warning only: no defines, ignore patterns or runtime config (feature flags were retired).
export default defineNuxtModule({
  meta: { name: 'pandablog-legacy-module-manifest' },
  setup(_options, nuxt) {
    const report = inspectLegacyModuleManifest(nuxt.options.rootDir)
    if (report.found) console.warn(formatLegacyManifestWarning(report))
  }
})
