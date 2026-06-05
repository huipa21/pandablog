import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = process.cwd()
const baselinePath = join(root, '.style-drift-baseline.json')
const update = process.argv.includes('--update')

const ignoredDirectories = new Set([
  '.git',
  '.nuxt',
  '.output',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'storage',
  'test-results'
])

const extensions = new Set(['.css', '.js', '.mjs', '.ts', '.vue'])
const hexPattern = /#[0-9a-fA-F]{3,8}\b/g

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue

    const absolutePath = join(directory, entry)
    const stats = statSync(absolutePath)

    if (stats.isDirectory()) {
      walk(absolutePath, files)
      continue
    }

    const extension = entry.includes('.') ? entry.slice(entry.lastIndexOf('.')) : ''
    if (extensions.has(extension)) files.push(absolutePath)
  }

  return files
}

function toRelativePath(absolutePath) {
  return relative(root, absolutePath).split(sep).join('/')
}

function collect() {
  const result = {}

  for (const absolutePath of walk(root)) {
    const relativePath = toRelativePath(absolutePath)
    const source = readFileSync(absolutePath, 'utf8')
    const counts = {}

    for (const match of source.matchAll(hexPattern)) {
      const value = match[0].toLowerCase()
      counts[value] = (counts[value] ?? 0) + 1
    }

    if (Object.keys(counts).length) {
      result[relativePath] = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
    }
  }

  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)))
}

function loadBaseline() {
  if (!existsSync(baselinePath)) return {}
  return JSON.parse(readFileSync(baselinePath, 'utf8'))
}

const current = collect()

if (update) {
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`)
  console.log(`Updated ${toRelativePath(baselinePath)}`)
  process.exit(0)
}

const baseline = loadBaseline()
const failures = []

for (const [file, counts] of Object.entries(current)) {
  for (const [value, count] of Object.entries(counts)) {
    const allowed = baseline[file]?.[value] ?? 0
    if (count > allowed) failures.push(`${file}: ${value} count ${count} exceeds baseline ${allowed}`)
  }
}

if (failures.length) {
  console.error('Hardcoded color drift detected. Use theme tokens or update the baseline after a deliberate migration.')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('No hardcoded color drift detected')
