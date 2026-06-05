export type ThemeMode = 'light' | 'dark'

export const ADMIN_COLOR_MODE_KEY = 'admin_color_mode'
export const DEFAULT_ADMIN_COLOR_MODE: ThemeMode = 'light'

export function normalizeThemeMode(value: unknown): ThemeMode | null {
  return value === 'light' || value === 'dark' ? value : null
}