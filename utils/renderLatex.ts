import katex from 'katex'

export interface RenderLatexOptions {
  displayMode?: boolean
  errorColor?: string
}

export function renderLatex(latex: unknown, options: RenderLatexOptions = {}) {
  return katex.renderToString(String(latex ?? ''), {
    displayMode: options.displayMode ?? false,
    throwOnError: false,
    errorColor: options.errorColor ?? 'var(--pb-math-error, crimson)',
    strict: false,
    output: 'htmlAndMathml'
  })
}