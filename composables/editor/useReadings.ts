import { useSessionFetch } from '~/composables/useSessionFetch'
import type { AnnotLang } from '~/extensions/rubyUnit'

export type ReadingSegment =
  | { kind: 'ruby', base: string, reading: string }
  | { kind: 'text', text: string }

interface AnnotateResponse {
  segments: ReadingSegment[]
}

export function useReadings() {
  const sessionFetch = useSessionFetch()

  async function annotate(text: string, lang: AnnotLang): Promise<ReadingSegment[]> {
    if (!text) return []

    const response = await sessionFetch<AnnotateResponse>('/api/admin/annotate', {
      method: 'POST',
      body: { text, lang }
    })

    return Array.isArray(response.segments) ? response.segments : []
  }

  return { annotate }
}
