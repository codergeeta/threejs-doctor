import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('CI workflow file', () => {
  it('exists and runs pnpm test', () => {
    const yml = readFileSync(
      resolve(process.cwd(), '../../.github/workflows/ci.yml'),
      'utf8',
    )
    expect(yml).toContain('pnpm test')
    expect(yml).toContain('pnpm typecheck')
    expect(yml).toContain('threejs-doctor ci')
  })
})
