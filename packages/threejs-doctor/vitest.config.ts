import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'threejs-doctor-placeholder',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
