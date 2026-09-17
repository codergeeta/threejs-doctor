import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    name: 'runtime',
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@threejs-doctor/core': path.resolve(root, '../core/src/index.ts'),
      '@threejs-doctor/rules': path.resolve(root, '../rules/src/index.ts'),
    },
  },
})
