import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'acceptance-fixture-game',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
