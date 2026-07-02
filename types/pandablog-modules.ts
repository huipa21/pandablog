export interface PandablogModulesManifest {
  $schema?: string
  version: 1
  modules: PandablogModulesConfig
}

export interface PandablogModulesConfig {
  editor: EditorModuleConfig
  logs: LogsModuleConfig
  analytics: AnalyticsModuleConfig
  users: UsersModuleConfig
  themes: ThemesModuleConfig
  mfa: MfaModuleConfig
  securityAlerts: SecurityAlertsModuleConfig
  backups: BackupsModuleConfig
  graphView: GraphViewModuleConfig
  publishActivityHeatmap: PublishActivityHeatmapModuleConfig
  postVersioning: PostVersioningModuleConfig
}

export interface EditorModuleConfig {
  enabled: boolean
  blocks: Record<EditorBlockKey, boolean>
}

export interface LogsModuleConfig {
  enabled: boolean
  accessLogs: boolean
  activityLogs: boolean
  errorLogs: boolean
}

export interface AnalyticsModuleConfig {
  enabled: boolean
  geoip: boolean
}

export interface UsersModuleConfig {
  enabled: boolean
  multiUser: boolean
}

export type BundledThemeKey = 'tesla' | 'clay' | 'notion' | 'hexagon'

export interface ThemesModuleConfig {
  enabled: boolean
  bundled: Record<BundledThemeKey, boolean>
}

export interface MfaModuleConfig {
  enabled: boolean
}

export interface SecurityAlertsModuleConfig {
  enabled: boolean
}

export interface BackupsModuleConfig {
  enabled: boolean
}

export interface GraphViewModuleConfig {
  enabled: boolean
}

export interface PublishActivityHeatmapModuleConfig {
  enabled: boolean
}

export interface PostVersioningModuleConfig {
  enabled: boolean
}

export type EditorBlockKey =
  | 'accordionBlock'
  | 'annotationBlock'
  | 'blockMath'
  | 'blockquote'
  | 'codeBlock'
  | 'columnsBlock'
  | 'customHtml'
  | 'diffBlock'
  | 'filesBlock'
  | 'footnotesBlock'
  | 'horizontalRule'
  | 'image'
  | 'inlineMath'
  | 'mediaText'
  | 'mermaid'
  | 'relatedPost'
  | 'table'
  | 'tabsBlock'
  | 'videoEmbed'
