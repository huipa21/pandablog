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
export type PostVisibility = 'public' | 'private' | 'password'

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
  visibility?: PostVisibility
  password_hint?: string | null
  tag_ids?: string[]
  category_ids?: string[]
  tags?: TagRecord[]
  categories?: CategoryRecord[]
}

export interface PostListItem {
  id: string
  slug: string
  title: string
  summary?: string | null
  cover_image?: string | null
  published_at?: string | null
  visibility?: PostVisibility
}

export interface PostLockedResponse {
  locked: true
  slug: string
  title?: string | null
  visibility: 'password'
  passwordHint?: string | null
}

export interface ConceptRecord {
  id: string
  name: string
  slug: string
  description?: string | null
}

// ============ MEDIA LIBRARY ============

export type MediaFileType = 'image' | 'video' | 'document' | 'archive' | 'other'

export interface MediaImageMeta {
  width?: number | null
  height?: number | null
  format?: string | null
  has_alpha?: boolean
  exif?: Record<string, unknown> | null
}

export interface MediaFolderRecord {
  id: string
  name: string
  slug: string
  parent?: string | null
  created_at: string
  updated_at: string
}

export interface MediaTagSummary {
  id: string
  name: string
  slug: string
  count: number
  latest_uploaded_at?: string | null
}

export interface MediaRecord {
  id: string
  original_name: string
  stored_name?: string
  extension: string
  mime_type: string
  size: number
  hash: string
  path?: string
  storage_path?: string
  url: string
  width?: number | null
  height?: number | null
  is_image?: boolean
  image_meta?: MediaImageMeta | null
  folders?: string[]
  tags?: string[]
  comment?: string | null
  reference_count?: number
  referenced_by?: string[]
  thumbnail_path?: string | null
  thumbnail_url?: string | null
  perceptual_hash?: string | null
  created_at: string
  uploaded_at?: string
  updated_at?: string
}

export type UploadResultStatus = 'created' | 'duplicate' | 'similar' | 'rejected'

export interface UploadFileResult {
  original_name?: string
  extension?: string
  status: UploadResultStatus
  reason?: string
  record?: MediaRecord
  similar_to?: MediaRecord
}

export interface CategoryRecord {
  id: string
  name: string
  slug: string
  description?: string | null
  post_count?: number
}

export interface TagRecord {
  id: string
  name: string
  slug: string
  post_count?: number
  media_count?: number
}