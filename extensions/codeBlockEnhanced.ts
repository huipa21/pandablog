import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'

export const CODE_BLOCK_THEMES = [
  { value: 'github-dark', label: 'GitHub Dark' },
  { value: 'github-light', label: 'GitHub Light' },
  { value: 'vs-dark', label: 'Visual Studio Dark' },
  { value: 'vs-light', label: 'Visual Studio Light' },
  { value: 'monokai', label: 'Monokai' },
  { value: 'dracula', label: 'Dracula' },
  { value: 'one-dark', label: 'One Dark Pro' },
  { value: 'solarized-dark', label: 'Solarized Dark' },
  { value: 'solarized-light', label: 'Solarized Light' },
  { value: 'nord', label: 'Nord' },
  { value: 'tomorrow-night', label: 'Tomorrow Night' }
] as const

export const CODE_BLOCK_LANGUAGES = [
  { value: 'text', label: 'Plain text' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'css', label: 'CSS' },
  { value: 'diff', label: 'Diff' },
  { value: 'go', label: 'Go' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'html', label: 'HTML' },
  { value: 'ini', label: 'INI / TOML' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'js', label: 'JavaScript (js)' },
  { value: 'json', label: 'JSON' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'lua', label: 'Lua' },
  { value: 'makefile', label: 'Makefile' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'objectivec', label: 'Objective-C' },
  { value: 'perl', label: 'Perl' },
  { value: 'php', label: 'PHP' },
  { value: 'python', label: 'Python' },
  { value: 'r', label: 'R' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'rust', label: 'Rust' },
  { value: 'scss', label: 'SCSS' },
  { value: 'shell', label: 'Shell' },
  { value: 'sql', label: 'SQL' },
  { value: 'swift', label: 'Swift' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'ts', label: 'TypeScript (ts)' },
  { value: 'vue', label: 'Vue' },
  { value: 'xml', label: 'XML' },
  { value: 'yaml', label: 'YAML' }
] as const

export const DEFAULT_CODE_THEME = 'github-dark'

export const CodeBlockEnhanced = CodeBlockLowlight.extend({
  name: 'codeBlock',

  addKeyboardShortcuts() {
    const parent = this.parent?.() ?? {}
    return {
      ...parent,
      // Prevent backspace from deleting the code block when it is empty.
      // The node can only be removed via the toolbar "delete block" action.
      Backspace: ({ editor }) => {
        const { empty, $anchor } = editor.state.selection
        if (!empty || $anchor.parent.type.name !== this.name) return false
        const isAtStart = $anchor.pos === $anchor.start()
        const isEmpty = !$anchor.parent.textContent.length
        if (isAtStart && isEmpty) {
          // Swallow the event — keep the empty code block alive.
          return true
        }
        // Delegate to the parent handler for all other cases.
        return (parent as Record<string, unknown>).Backspace
          ? (parent as { Backspace: (ctx: { editor: typeof editor }) => boolean }).Backspace({ editor })
          : false
      }
    }
  },

  addAttributes() {
    const parent = this.parent?.() ?? {}
    return {
      ...parent,
      language: {
        default: 'text',
        parseHTML: (element) => {
          const cls = element.firstElementChild?.getAttribute('class') ?? ''
          const match = cls.match(/language-(\S+)/)
          return match?.[1] ?? element.getAttribute('data-language') ?? 'text'
        },
        renderHTML: (attrs) => ({ 'data-language': attrs.language ?? 'text' })
      },
      theme: {
        default: DEFAULT_CODE_THEME,
        parseHTML: (element) => element.getAttribute('data-theme') ?? DEFAULT_CODE_THEME,
        renderHTML: (attrs) => ({ 'data-theme': attrs.theme ?? DEFAULT_CODE_THEME })
      },
      lineNumbers: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-line-numbers') !== 'false',
        renderHTML: (attrs) => ({ 'data-line-numbers': attrs.lineNumbers === false ? 'false' : 'true' })
      },
      fileName: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-file-name') ?? '',
        renderHTML: (attrs) => {
          const value = typeof attrs.fileName === 'string' ? attrs.fileName.trim() : ''
          return value ? { 'data-file-name': value } : {}
        }
      },
      showTotalLines: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-show-total-lines') === 'true',
        renderHTML: (attrs) => ({ 'data-show-total-lines': attrs.showTotalLines === true ? 'true' : 'false' })
      },
      wrap: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-wrap') !== 'false',
        renderHTML: (attrs) => ({ 'data-wrap': attrs.wrap === false ? 'false' : 'true' })
      },
      zoom: {
        default: 1,
        parseHTML: (element) => {
          const raw = Number.parseFloat(element.getAttribute('data-zoom') ?? '1')
          if (!Number.isFinite(raw)) {
            return 1
          }
          return Math.max(0.7, Math.min(2, raw))
        },
        renderHTML: (attrs) => {
          const raw = Number(attrs.zoom ?? 1)
          const zoom = Number.isFinite(raw) ? Math.max(0.7, Math.min(2, raw)) : 1
          return { 'data-zoom': String(Math.round(zoom * 100) / 100) }
        }
      },
      collapsed: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-collapsed') !== 'false',
        renderHTML: (attrs) => ({ 'data-collapsed': attrs.collapsed === false ? 'false' : 'true' })
      }
    }
  }
})
