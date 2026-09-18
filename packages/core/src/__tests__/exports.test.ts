import { describe, it, expect } from 'vitest'
import {
  PACKAGE_NAME,
  SAFE_PASSES,
  AGGRESSIVE_PASSES,
  safePassesFor,
  probeDevice,
  snapshotScene,
  MetricsCollector,
} from '../index.js'
import type { PassId } from '../index.js'

describe('core public exports', () => {
  it('keeps material-downgrade and distance-cull out of the default safe pass set', () => {
    const expected: readonly PassId[] = [
      'dpr-cap',
      'pixel-budget',
      'shadow-budget',
      'postfx-budget',
      'tone-map-lite',
      'anisotropy-cap',
    ]
    expect(SAFE_PASSES).toEqual(expected)
    expect(SAFE_PASSES).not.toContain('frameloop-demand')
    expect(SAFE_PASSES).not.toContain('material-downgrade')
    expect(SAFE_PASSES).not.toContain('distance-cull')
  })

  it('re-exports probeDevice, snapshotScene, and MetricsCollector from the package barrel', () => {
    expect(PACKAGE_NAME).toBe('@threejs-doctor/core')
    expect(typeof probeDevice).toBe('function')
    expect(typeof snapshotScene).toBe('function')
    expect(typeof MetricsCollector).toBe('function')
  })

  it('keeps distance-cull behind AGGRESSIVE_PASSES opt-in', () => {
    expect(AGGRESSIVE_PASSES).toEqual(['distance-cull'])
    expect(SAFE_PASSES).not.toEqual(expect.arrayContaining([...AGGRESSIVE_PASSES]))
  })

  it('safePassesFor adds frameloop-demand only for marketing/product', () => {
    expect(safePassesFor('game')).toEqual([...SAFE_PASSES])
    expect(safePassesFor('cad')).toEqual([...SAFE_PASSES])
    expect(safePassesFor('auto')).toEqual([...SAFE_PASSES])
    expect(safePassesFor('marketing')).toEqual([...SAFE_PASSES, 'frameloop-demand'])
    expect(safePassesFor('product')).toEqual([...SAFE_PASSES, 'frameloop-demand'])
  })
})
