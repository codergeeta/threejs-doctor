import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    name: 'rules',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@threejs-doctor/core': path.resolve(root, '../core/src/index.ts'),
    },
  },
})
