import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('rules vitest workspace aliases', () => {
  it('resolves core from source so tests run without dist', () => {
    const cfg = readFileSync(resolve(process.cwd(), 'vitest.config.ts'), 'utf8')
    expect(cfg).toContain("'@threejs-doctor/core': path.resolve(root, '../core/src/index.ts')")
  })
})
