import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('runtime vitest workspace aliases', () => {
  it('resolves core and rules from source so tests run without dist', () => {
    const cfg = readFileSync(resolve(process.cwd(), 'vitest.config.ts'), 'utf8')
    expect(cfg).toContain("'@threejs-doctor/core': path.resolve(root, '../core/src/index.ts')")
    expect(cfg).toContain("'@threejs-doctor/rules': path.resolve(root, '../rules/src/index.ts')")
  })
})
