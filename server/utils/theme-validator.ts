import { z } from 'zod'

export const ThemeManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,49}$/, 'id must be lowercase alphanumeric with dashes, 2-50 chars'),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be semver (x.y.z)'),
  author: z.string().min(1).max(100),
  description: z.string().max(500),
  supports: z.array(z.enum(['light', 'dark'])).min(1),
  preview: z.string(),
  tokens: z.string(),
  css: z.string(),
  layout: z.object({
    type: z.enum(['single-column', 'two-column', 'three-column']),
    leftSidebar: z.enum(['toc', 'nav']).nullable(),
    rightSidebar: z.enum(['meta-graph', 'meta', 'related']).nullable(),
    maxContentWidth: z.string().regex(/^\d+(\.\d+)?(px|rem|em|ch|%)$/),
    variant: z.string().regex(/^[a-z0-9][a-z0-9-]{1,49}$/).optional(),
    showCoverImage: z.boolean(),
    stickyHeader: z.boolean()
  })
})

export type ThemeManifest = z.infer<typeof ThemeManifestSchema>

const TokenGroupSchema = z.object({
  color: z.record(z.string(), z.string()),
  font: z.record(z.string(), z.string()).optional(),
  size: z.record(z.string(), z.string()).optional(),
  space: z.record(z.string(), z.string()).optional(),
  radius: z.record(z.string(), z.string()).optional(),
  shadow: z.record(z.string(), z.string()).optional(),
  layout: z.record(z.string(), z.string()).optional()
})

export const ThemeTokensSchema = z.object({
  light: TokenGroupSchema,
  dark: TokenGroupSchema
})

export type ThemeTokens = z.infer<typeof ThemeTokensSchema>
