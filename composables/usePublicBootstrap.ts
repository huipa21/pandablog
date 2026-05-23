import type { CategoryRecord, TagRecord } from '~/types/content'

export interface PublicThemeInfo {
  id: string
  name: string
  version: string
  layout: {
    type: 'single-column' | 'two-column' | 'three-column'
    leftSidebar: 'toc' | 'nav' | null
    rightSidebar: 'meta-graph' | 'meta' | 'related' | null
    maxContentWidth: string
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
}

export function usePublicBootstrap() {
  return useAsyncData('public-bootstrap', () => $fetch<PublicBootstrapResponse>('/api/site/bootstrap'), {
    dedupe: 'defer',
    default: () => ({
      settings: {},
      tags: [],
      categories: [],
      theme: null
    })
  })
}
