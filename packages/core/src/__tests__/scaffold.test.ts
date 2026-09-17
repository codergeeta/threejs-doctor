import { describe, it, expect } from 'vitest'
import { PACKAGE_NAME } from '../index.js'

describe('monorepo scaffold', () => {
  it('exports the core package name', () => {
    expect(PACKAGE_NAME).toBe('@threejs-doctor/core')
  })
})
