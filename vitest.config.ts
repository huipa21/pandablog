import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Server utils import shared code via the Nuxt `~` / `@` aliases.
  resolve: {
    alias: {
      '~': rootDir,
      '@': rootDir
    }
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', '.nuxt/**']
  }
})
