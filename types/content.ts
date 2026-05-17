export interface JsonContent {
  type?: string
  attrs?: Record<string, unknown>
  text?: string
  marks?: Array<{
    type: string
    attrs?: Record<string, unknown>
  }>
  content?: JsonContent[]
}

export type PostStatus = 'draft' | 'published' | 'archived'

export interface PostRecord {
  id: string
  title: string
  slug: string
  summary?: string | null
  content_json: JsonContent
  content_text: string
  status: PostStatus
  cover_image?: string | null
  author_username: string
  published_at?: string | null
  created_at: string
  updated_at: string
  view_count: number
}

export interface ConceptRecord {
  id: string
  name: string
  slug: string
  description?: string | null
}