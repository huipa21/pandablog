import { defineNuxtModule } from '@nuxt/kit'
import { getPandablogModuleDefines, loadPandablogModules } from '../build/pandablog-modules'

export default defineNuxtModule({
  meta: {
    name: 'pandablog-feature-flags',
    configKey: 'pandablogFeatureFlags'
  },
  setup(_options, nuxt) {
    const manifest = loadPandablogModules(nuxt.options.rootDir)
    const modules = manifest.modules

    nuxt.options.runtimeConfig.public.modules = modules
    nuxt.options.vite.define = {
      ...nuxt.options.vite.define,
      ...getPandablogModuleDefines(manifest)
    }

    const ignore = new Set(nuxt.options.ignore ?? [])
    nuxt.options.nitro ??= {}
    const nitroIgnore = new Set(nuxt.options.nitro.ignore ?? [])

    if (!modules.logs.enabled) {
      ignore.add('server/api/admin/logs/**')
      ignore.add('server/api/admin/settings/logging/**')
      ignore.add('server/middleware/access-logging.ts')
      ignore.add('server/plugins/access-log-flush.ts')
      ignore.add('server/plugins/logging-error-hook.ts')
      ignore.add('pages/admin/logs/**')
      ignore.add('pages/admin/dashboard/logs/**')
    } else if (!modules.logs.accessLogs) {
      ignore.add('server/middleware/access-logging.ts')
      ignore.add('server/plugins/access-log-flush.ts')
    }

    if (modules.logs.enabled && !modules.logs.accessLogs) {
      ignore.add('server/api/admin/logs/access.get.ts')
      ignore.add('pages/admin/logs/access.vue')
      ignore.add('pages/admin/dashboard/logs/access.vue')
    }

    if (modules.logs.enabled && !modules.logs.activityLogs) {
      ignore.add('server/api/admin/logs/activity.get.ts')
      ignore.add('pages/admin/logs/activity.vue')
      ignore.add('pages/admin/dashboard/logs/activity.vue')
    }

    if (modules.logs.enabled && !modules.logs.errorLogs) {
      ignore.add('server/api/admin/logs/errors.get.ts')
      ignore.add('server/api/admin/logs/errors/**')
      ignore.add('pages/admin/logs/errors.vue')
      ignore.add('pages/admin/dashboard/logs/errors.vue')
    }

    if (modules.logs.enabled && (!modules.logs.accessLogs || !modules.logs.errorLogs)) {
      ignore.add('pages/admin/dashboard/logs/index.vue')
    }

    if (!modules.analytics.enabled) {
      ignore.add('plugins/analytics.client.ts')
      ignore.add('server/api/analytics/**')
      ignore.add('server/api/admin/analytics/**')
      ignore.add('server/api/admin/settings/analytics/**')
      ignore.add('server/plugins/analytics-rollup.ts')
      ignore.add('pages/admin/analytics.vue')
      ignore.add('pages/admin/dashboard/analytics.vue')
      ignore.add('pages/admin/settings/analytics.vue')
      ignore.add('components/admin/Analytics*.vue')
    }

    if (!modules.analytics.geoip) {
      nitroIgnore.add('storage/geoip/**')
    }

    if (!modules.editor.blocks.annotationBlock) {
      ignore.add('server/api/admin/annotate.post.ts')
      nitroIgnore.add('public/dict/**')
    }

    if (!modules.users.enabled || !modules.users.multiUser) {
      ignore.add('server/api/admin/users/**')
      ignore.add('pages/admin/users/**')
      ignore.add('components/admin/UserDetailDialog.vue')
    }

    nuxt.options.ignore = [...ignore]
    nuxt.options.nitro.ignore = [...nitroIgnore]
  }
})