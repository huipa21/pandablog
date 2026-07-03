import type { CategoryRecord, TagRecord } from '~/types/content'
import type { ThemeMode } from '~/utils/themeMode'

export interface PublicThemeInfo {
  id: string
  name: string
  version: string
  layout: {
    type: 'single-column' | 'two-column' | 'three-column'
    leftSidebar: 'toc' | 'nav' | null
    rightSidebar: 'meta-graph' | 'meta' | 'related' | null
    maxContentWidth: string
    variant?: string
    showCoverImage: boolean
    stickyHeader: boolean
  }
  supports: Array<'light' | 'dark'>
}

export interface PublicBootstrapResponse {
  settings: Record<string, unknown>
  tags: TagRecord[]
  categories: CategoryRecord[]
  theme: PublicThemeInfo | null
  themeMode: ThemeMode | null
}

export function usePublicBootstrap() {
  const requestFetch = useRequestFetch()

  return useAsyncData('public-bootstrap', () => requestFetch<PublicBootstrapResponse>('/api/site/bootstrap'), {
    dedupe: 'defer',
    default: () => ({
      settings: {},
      tags: [],
      categories: [],
      theme: null,
      themeMode: null
    })
  })
}
