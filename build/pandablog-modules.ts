import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { EditorBlockKey, PandablogModulesConfig, PandablogModulesManifest } from '../types/pandablog-modules'

export const PANDABLOG_MODULES_MANIFEST = 'pandablog.modules.json'

export const EDITOR_BLOCK_KEYS = [
  'accordionBlock',
  'annotationBlock',
  'blockMath',
  'blockquote',
  'codeBlock',
  'columnsBlock',
  'customHtml',
  'diffBlock',
  'filesBlock',
  'footnotesBlock',
  'horizontalRule',
  'image',
  'inlineMath',
  'mediaText',
  'mermaid',
  'relatedPost',
  'table',
  'tabsBlock',
  'videoEmbed'
] as const satisfies readonly EditorBlockKey[]

export const DEFAULT_PANDABLOG_MODULES: PandablogModulesConfig = {
  editor: {
    enabled: true,
    blocks: Object.fromEntries(EDITOR_BLOCK_KEYS.map((key) => [key, true])) as Record<EditorBlockKey, boolean>
  },
  logs: {
    enabled: true,
    accessLogs: true,
    activityLogs: true,
    errorLogs: true
  },
  analytics: {
    enabled: true,
    geoip: true
  },
  users: {
    enabled: true,
    multiUser: true
  },
  themes: {
    enabled: true
  },
  mfa: {
    enabled: true
  },
  securityAlerts: {
    enabled: true
  },
  backups: {
    enabled: true
  }
}

export function loadPandablogModules(rootDir = process.cwd()): PandablogModulesManifest {
  const path = resolve(rootDir, PANDABLOG_MODULES_MANIFEST)
  if (!existsSync(path)) {
    return {
      version: 1,
      modules: cloneModules(DEFAULT_PANDABLOG_MODULES)
    }
  }

  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<PandablogModulesManifest>
  return normalizePandablogModules(raw)
}

export function normalizePandablogModules(raw: Partial<PandablogModulesManifest>): PandablogModulesManifest {
  const modules = raw.modules ?? DEFAULT_PANDABLOG_MODULES
  const editorEnabled = modules.editor?.enabled ?? DEFAULT_PANDABLOG_MODULES.editor.enabled
  const editorBlocks = modules.editor?.blocks ?? DEFAULT_PANDABLOG_MODULES.editor.blocks
  const logsEnabled = modules.logs?.enabled ?? DEFAULT_PANDABLOG_MODULES.logs.enabled
  const analyticsEnabled = modules.analytics?.enabled ?? DEFAULT_PANDABLOG_MODULES.analytics.enabled
  const usersEnabled = modules.users?.enabled ?? DEFAULT_PANDABLOG_MODULES.users.enabled
  const themesEnabled = modules.themes?.enabled ?? DEFAULT_PANDABLOG_MODULES.themes.enabled
  const mfaEnabled = modules.mfa?.enabled ?? DEFAULT_PANDABLOG_MODULES.mfa.enabled
  const securityAlertsEnabled = modules.securityAlerts?.enabled ?? DEFAULT_PANDABLOG_MODULES.securityAlerts.enabled
  const backupsEnabled = modules.backups?.enabled ?? DEFAULT_PANDABLOG_MODULES.backups.enabled

  return {
    $schema: raw.$schema,
    version: 1,
    modules: {
      editor: {
        enabled: editorEnabled,
        blocks: Object.fromEntries(
          EDITOR_BLOCK_KEYS.map((key) => [key, editorEnabled && (editorBlocks[key] ?? true)])
        ) as Record<EditorBlockKey, boolean>
      },
      logs: {
        enabled: logsEnabled,
        accessLogs: logsEnabled && (modules.logs?.accessLogs ?? true),
        activityLogs: logsEnabled && (modules.logs?.activityLogs ?? true),
        errorLogs: logsEnabled && (modules.logs?.errorLogs ?? true)
      },
      analytics: {
        enabled: analyticsEnabled,
        geoip: analyticsEnabled && (modules.analytics?.geoip ?? true)
      },
      users: {
        enabled: usersEnabled,
        multiUser: usersEnabled && (modules.users?.multiUser ?? true)
      },
      themes: {
        enabled: themesEnabled
      },
      mfa: {
        enabled: mfaEnabled
      },
      securityAlerts: {
        enabled: securityAlertsEnabled
      },
      backups: {
        enabled: backupsEnabled
      }
    }
  }
}

export function getPandablogModuleDefines(manifest: PandablogModulesManifest): Record<string, string> {
  const { modules } = manifest
  const defines: Record<string, string> = {
    __PB_MODULE_EDITOR__: asDefine(modules.editor.enabled),
    __PB_MODULE_LOGS__: asDefine(modules.logs.enabled),
    __PB_MODULE_LOGS_ACCESS__: asDefine(modules.logs.accessLogs),
    __PB_MODULE_LOGS_ACTIVITY__: asDefine(modules.logs.activityLogs),
    __PB_MODULE_LOGS_ERROR__: asDefine(modules.logs.errorLogs),
    __PB_MODULE_ANALYTICS__: asDefine(modules.analytics.enabled),
    __PB_MODULE_ANALYTICS_GEOIP__: asDefine(modules.analytics.geoip),
    __PB_MODULE_USERS__: asDefine(modules.users.enabled),
    __PB_MODULE_USERS_MULTI_USER__: asDefine(modules.users.multiUser),
    __PB_MODULE_THEMES__: asDefine(modules.themes.enabled),
    __PB_MODULE_MFA__: asDefine(modules.mfa.enabled),
    __PB_MODULE_SECURITY_ALERTS__: asDefine(modules.securityAlerts.enabled),
    __PB_MODULE_BACKUPS__: asDefine(modules.backups.enabled)
  }

  for (const block of EDITOR_BLOCK_KEYS) {
    defines[`__PB_BLOCK_${toConstantName(block)}__`] = asDefine(modules.editor.blocks[block])
  }

  return defines
}

export function toConstantName(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()
}

function asDefine(value: boolean): string {
  return JSON.stringify(value)
}

function cloneModules(modules: PandablogModulesConfig): PandablogModulesConfig {
  return JSON.parse(JSON.stringify(modules)) as PandablogModulesConfig
}
