import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  server: { port: 4177, strictPort: true },
  resolve: {
    alias: {
      '@threejs-doctor/core': path.resolve(root, '../../packages/core/src/index.ts'),
      '@threejs-doctor/rules': path.resolve(root, '../../packages/rules/src/index.ts'),
      '@threejs-doctor/runtime': path.resolve(root, '../../packages/runtime/src/index.ts'),
    },
  },
})
