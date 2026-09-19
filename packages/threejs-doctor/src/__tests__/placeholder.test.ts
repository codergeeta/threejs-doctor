import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  name: string
  private?: boolean
  bin?: Record<string, string>
  dependencies?: Record<string, string>
  publishConfig?: { access?: string }
}

describe('unscoped threejs-doctor placeholder', () => {
  it('is public, named threejs-doctor, and depends on the scoped CLI', () => {
    expect(pkg.name).toBe('threejs-doctor')
    expect(pkg.private).toBeUndefined()
    expect(pkg.publishConfig?.access).toBe('public')
    expect(pkg.bin?.['threejs-doctor']).toBe('./bin/threejs-doctor.js')
    expect(pkg.dependencies?.['@threejs-doctor/cli']).toMatch(/workspace|\d/)
  })

  it('leaves the monorepo root private under a different name', () => {
    const rootPkg = JSON.parse(readFileSync(resolve(root, '../../package.json'), 'utf8')) as {
      name: string
      private?: boolean
    }
    expect(rootPkg.name).not.toBe('threejs-doctor')
    expect(rootPkg.private).toBe(true)
  })

  it('bin source forwards to the scoped CLI entry', () => {
    const src = readFileSync(resolve(root, 'bin/threejs-doctor.js'), 'utf8')
    expect(src).toContain('@threejs-doctor/cli/bin/threejs-doctor.js')
    expect(src).toContain('spawnSync')
  })
})
