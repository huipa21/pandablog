import { defineConfig } from 'vitest/config'
import base from './vitest.config'

// Do not merge array-valued includes: only these two live suites are eligible.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tests/integration/backend-hardening.test.ts', 'tests/unit/error-groups-live.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
})
