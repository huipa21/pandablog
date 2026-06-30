export interface RuntimeModulesConfig {
  editor?: { enabled?: boolean, blocks?: Record<string, boolean | undefined> }
  logs?: { enabled?: boolean, accessLogs?: boolean, activityLogs?: boolean, errorLogs?: boolean }
  analytics?: { enabled?: boolean, geoip?: boolean }
  users?: { enabled?: boolean, multiUser?: boolean }
  themes?: { enabled?: boolean }
  mfa?: { enabled?: boolean }
  securityAlerts?: { enabled?: boolean }
  backups?: { enabled?: boolean }
  graphView?: { enabled?: boolean }
  publishActivityHeatmap?: { enabled?: boolean }
  postVersioning?: { enabled?: boolean }
}

export function getRuntimeModuleConfig() {
  return useRuntimeConfig().public.modules as RuntimeModulesConfig | undefined
}

export function resolveModuleFlags(modules?: RuntimeModulesConfig | null) {
  const logsEnabled = modules?.logs?.enabled !== false
  const analyticsEnabled = modules?.analytics?.enabled !== false
  const usersEnabled = modules?.users?.enabled !== false
  const editorEnabled = modules?.editor?.enabled !== false

  return {
    editor: editorEnabled,
    logs: logsEnabled,
    accessLogs: logsEnabled && modules?.logs?.accessLogs !== false,
    activityLogs: logsEnabled && modules?.logs?.activityLogs !== false,
    errorLogs: logsEnabled && modules?.logs?.errorLogs !== false,
    analytics: analyticsEnabled,
    geoip: analyticsEnabled && modules?.analytics?.geoip !== false,
    users: usersEnabled,
    multiUser: usersEnabled && modules?.users?.multiUser !== false,
    themes: modules?.themes?.enabled !== false,
    mfa: modules?.mfa?.enabled !== false,
    securityAlerts: modules?.securityAlerts?.enabled !== false,
    backups: modules?.backups?.enabled !== false,
    graphView: modules?.graphView?.enabled !== false,
    publishActivityHeatmap: modules?.publishActivityHeatmap?.enabled !== false,
    postVersioning: modules?.postVersioning?.enabled !== false
  }
}

export function isRuntimeEditorBlockEnabled(modules: RuntimeModulesConfig | null | undefined, blockName: string) {
  return modules?.editor?.enabled !== false && modules?.editor?.blocks?.[blockName] !== false
}