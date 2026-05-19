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
  shadow: z.record(z.string(), z.string()).optional()
})

export const ThemeTokensSchema = z.object({
  light: TokenGroupSchema,
  dark: TokenGroupSchema
})

export type ThemeTokens = z.infer<typeof ThemeTokensSchema>

/**
 * Reject CSS that contains potentially dangerous constructs.
 * Not a security boundary (CSS can't execute code), but blocks accidental issues.
 */
export function validateCss(css: string): { ok: true } | { ok: false, reason: string } {
  if (css.length > 500_000) return { ok: false, reason: 'CSS file too large (>500KB)' }
  // Block @import — themes must be self-contained
  if (/@import\s/i.test(css)) return { ok: false, reason: '@import is not allowed; bundle all CSS into theme.css' }
  // Block javascript: URLs
  if (/javascript\s*:/i.test(css)) return { ok: false, reason: 'javascript: URLs are not allowed in CSS' }
  // Block expression() (legacy IE, but defensive)
  if (/expression\s*\(/i.test(css)) return { ok: false, reason: 'expression() is not allowed' }
  return { ok: true }
}
