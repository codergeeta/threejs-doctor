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
    expect(yml).toContain('pnpm build')
    expect(yml).toContain('not implemented')
    expect(yml).not.toContain('node ./bin/threejs-doctor.js ci')
    // pnpm/action-setup@v4 errors if this is also set alongside packageManager
    expect(yml).not.toContain('version: 9')
    expect(yml).toContain('node-version: 22')
    expect(yml).not.toContain('node-version: 20')
  })
})
