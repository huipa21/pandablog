import type { Component } from 'vue'

type SvgModule = Component | { default?: Component }

const iconModules = import.meta.glob('~/assets/file-icons/*.svg', {
  eager: true,
  query: '?component'
}) as Record<string, SvgModule>

const emptyIcon = (() => null) as Component

const iconRegistry = Object.fromEntries(
  Object.entries(iconModules).map(([path, module]) => [iconKeyFromPath(path), componentFromModule(module)])
) as Record<string, Component>

export function useFileIcon() {
  function resolveIcon(filename: string): Component {
    const extension = extensionFromFilename(filename)
    return iconRegistry[extension] ?? iconRegistry._generic ?? emptyIcon
  }

  return { resolveIcon }
}

function componentFromModule(module: SvgModule): Component {
  if (typeof module === 'object' && module && 'default' in module && module.default) {
    return module.default
  }

  return module as Component
}

function iconKeyFromPath(path: string) {
  const fileName = path.split('/').pop() ?? ''
  return fileName.replace(/\.svg(?:\?.*)?$/, '').toLowerCase()
}

function extensionFromFilename(filename: string) {
  const cleanName = String(filename || '')
    .trim()
    .split(/[\\/]/)
    .pop()
    ?.split('?')[0]
    ?.split('#')[0]
    ?.trim() ?? ''

  const lastDot = cleanName.lastIndexOf('.')
  if (lastDot < 0 || lastDot === cleanName.length - 1) {
    return '_generic'
  }

  return cleanName.slice(lastDot + 1).toLowerCase().trim() || '_generic'
}