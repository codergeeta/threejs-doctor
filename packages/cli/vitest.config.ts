import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    name: 'cli',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@threejs-doctor/core': path.resolve(root, '../core/src/index.ts'),
      '@threejs-doctor/rules': path.resolve(root, '../rules/src/index.ts'),
      '@threejs-doctor/runtime': path.resolve(root, '../runtime/src/index.ts'),
      '@threejs-doctor/bench': path.resolve(root, '../bench/src/index.ts'),
    },
  },
})
