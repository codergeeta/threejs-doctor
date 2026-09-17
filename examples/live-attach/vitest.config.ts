import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    name: 'live-attach-example',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@threejs-doctor/core': path.resolve(root, '../../packages/core/src/index.ts'),
      '@threejs-doctor/rules': path.resolve(root, '../../packages/rules/src/index.ts'),
      '@threejs-doctor/runtime': path.resolve(root, '../../packages/runtime/src/index.ts'),
      '@threejs-doctor/ocean-adapter-example': path.resolve(
        root,
        '../ocean-adapter/src/index.ts',
      ),
    },
  },
})
