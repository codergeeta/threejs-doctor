import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBLISH_ORDER, assertPublishGoAllowed } from '../../../../scripts/publish.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('publish order', () => {
  it('reserves unscoped threejs-doctor before any scoped package', () => {
    expect(PUBLISH_ORDER[0]).toBe('packages/threejs-doctor')
    const first = JSON.parse(readFileSync(path.join(root, PUBLISH_ORDER[0]!, 'package.json'), 'utf8'))
    expect(first.name).toBe('threejs-doctor')
    const names = PUBLISH_ORDER.map((dir) => {
      const pkg = JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8'))
      return pkg.name as string
    })
    expect(names.slice(1).every((name) => name.startsWith('@threejs-doctor/'))).toBe(true)
    expect(names.indexOf('@threejs-doctor/core')).toBeLessThan(names.indexOf('@threejs-doctor/rules'))
    expect(names.indexOf('@threejs-doctor/rules')).toBeLessThan(names.indexOf('@threejs-doctor/runtime'))
    expect(names.indexOf('@threejs-doctor/runtime')).toBeLessThan(names.indexOf('@threejs-doctor/cli'))
    expect(names.indexOf('@threejs-doctor/cli')).toBeLessThan(names.indexOf('@threejs-doctor/r3f'))
  })

  it('refuses --go outside GitHub Actions and allows it in GHA', () => {
    expect(() => assertPublishGoAllowed(false, {})).not.toThrow()
    expect(() => assertPublishGoAllowed(true, { GITHUB_ACTIONS: 'true' })).not.toThrow()
    expect(() => assertPublishGoAllowed(true, {})).toThrow(/publish\.yml/)
    expect(() => assertPublishGoAllowed(true, { GITHUB_ACTIONS: 'false' })).toThrow(/workflow_dispatch/)
  })
})
