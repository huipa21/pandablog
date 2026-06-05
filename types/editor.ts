import type { JsonContent, PostVisibility } from './content'

export interface AdminPostEditorForm {
  title: string
  slug: string
  summary: string
  cover_image: string
  category_ids: string[]
  tag_ids: string[]
  category_names: string[]
  tag_names: string[]
  is_featured: boolean
  featured_at: string | null
  visibility: PostVisibility
  password: string
  password_hint: string
  content: JsonContent
}