import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'r3f',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
})
