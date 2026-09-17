import { describe, it, expect } from 'vitest'
import { PACKAGE_NAME, SAFE_PASSES, probeDevice, snapshotScene, MetricsCollector } from '../index.js'
import type { PassId } from '../index.js'

describe('core public exports', () => {
  it('keeps material-downgrade out of the default safe pass set', () => {
    const expected: readonly PassId[] = [
      'dpr-cap',
      'pixel-budget',
      'shadow-budget',
      'postfx-budget',
      'tone-map-lite',
      'anisotropy-cap',
      'frameloop-demand',
      'distance-cull',
    ]
    expect(SAFE_PASSES).toEqual(expected)
    expect(SAFE_PASSES).not.toContain('material-downgrade')
  })

  it('re-exports probeDevice, snapshotScene, and MetricsCollector from the package barrel', () => {
    expect(PACKAGE_NAME).toBe('@threejs-doctor/core')
    expect(typeof probeDevice).toBe('function')
    expect(typeof snapshotScene).toBe('function')
    expect(typeof MetricsCollector).toBe('function')
  })
})
