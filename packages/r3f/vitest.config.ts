import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    name: 'r3f',
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@threejs-doctor/core': path.resolve(root, '../core/src/index.ts'),
      '@threejs-doctor/rules': path.resolve(root, '../rules/src/index.ts'),
      '@threejs-doctor/runtime': path.resolve(root, '../runtime/src/index.ts'),
    },
  },
})
