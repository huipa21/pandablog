import { common, createLowlight } from 'lowlight'

// `common` covers every language exposed by `CODE_BLOCK_LANGUAGES` and avoids
// pulling in 150+ unused Highlight.js grammars (each a separate request in
// dev mode, and dead weight in the production bundle).
// Shared across public code block instances. The rendered DOM remains instance-owned.
export const codeBlockHtmlCache = new Map<string, string>()
export const codeBlockLowlight = createLowlight(common)