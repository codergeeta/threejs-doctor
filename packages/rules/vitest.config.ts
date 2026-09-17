import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'rules',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
