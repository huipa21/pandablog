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
    const moduleDefines = getPandablogModuleDefines(manifest)
    nuxt.options.vite.define = {
      ...nuxt.options.vite.define,
      ...moduleDefines
    }

    const ignore = new Set(nuxt.options.ignore ?? [])
    nuxt.options.nitro ??= {}
    // Nitro bundles server routes/plugins separately from Vite, so the build
    // constants must also be injected into Nitro's replace map; otherwise
    // server files referencing e.g. __PB_MODULE_LOGS__ throw ReferenceError.
    nuxt.options.nitro.replace = {
      ...nuxt.options.nitro.replace,
      ...moduleDefines
    }
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

    if (!modules.themes.enabled) {
      ignore.add('server/api/admin/themes/**')
      ignore.add('server/utils/theme-installer.ts')
      ignore.add('pages/admin/settings/themes.vue')
      nitroIgnore.add('themes/clay/**')
      nitroIgnore.add('themes/notion/**')
      nitroIgnore.add('themes/tesla/**')
    }

    if (!modules.mfa.enabled) {
      ignore.add('server/api/auth/login/mfa.post.ts')
      ignore.add('server/api/admin/auth/mfa/**')
    }

    if (!modules.securityAlerts.enabled) {
      ignore.add('server/api/admin/settings/security/**')
    }

    // The security settings page only hosts the alerts feature and MFA
    // enforcement controls; with both modules off there is nothing to render.
    if (!modules.securityAlerts.enabled && !modules.mfa.enabled) {
      ignore.add('pages/admin/settings/security.vue')
    }

    if (!modules.backups.enabled) {
      ignore.add('server/api/admin/backups/**')
      ignore.add('server/utils/backups/**')
      ignore.add('server/plugins/download-cleanup.ts')
      ignore.add('server/middleware/restore-maintenance.ts')
      ignore.add('pages/admin/backups/**')
      ignore.add('components/admin/backups/**')
      nitroIgnore.add('storage/backups/**')
    }

    if (!modules.graphView.enabled) {
      ignore.add('server/api/graph/**')
      ignore.add('server/utils/graph*.ts')
      ignore.add('types/graph.ts')
      ignore.add('pages/graph.vue')
      ignore.add('components/blog/Graph*.vue')
      ignore.add('components/blog/KnowledgeGraph.vue')
      ignore.add('components/blog/PostLocalGraph.vue')
    }

    if (!modules.publishActivityHeatmap.enabled) {
      ignore.add('server/api/posts/publish-frequency.get.ts')
      ignore.add('components/blog/PublishFrequencyHeatmap.vue')
    }

    if (!modules.postVersioning.enabled) {
      ignore.add('server/api/admin/posts/[id]/versions/**')
      ignore.add('server/api/admin/settings/versioning.put.ts')
      ignore.add('server/api/site/settings/versioning.get.ts')
      ignore.add('pages/admin/settings/versioning.vue')
    }

    nuxt.options.ignore = [...ignore]
    nuxt.options.nitro.ignore = [...nitroIgnore]
  }
})