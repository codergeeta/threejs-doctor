import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'acceptance-fixture',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
