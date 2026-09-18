import { describe, it, expect } from 'vitest'
import { defaultRules, runRules } from '../rule.js'
import { resolveProfile } from '../profiles.js'
import { lifecycleRule } from '../rules/lifecycle.js'
import type { RuleContext } from '../types.js'
import type { DeviceCapabilities, SceneSnapshot } from '@threejs-doctor/core'

const device: DeviceCapabilities = {
  tier: 'low',
  maxTextureSize: 4096,
  webgl: true,
  webgpu: false,
  devicePixelRatio: 3,
  hardwareConcurrency: 4,
}

function snap(partial: Partial<SceneSnapshot> = {}): SceneSnapshot {
  return {
    objectCount: 300,
    meshCount: 80,
    geometryCount: 80,
    materialCount: 70,
    textureCount: 10,
    estimatedVramBytes: 200_000_000,
    lightCount: 8,
    shadowCastingLightCount: 5,
    drawCalls: 250,
    triangles: 50_000,
    maxTextureDimension: 4096,
    continuousFrameloop: true,
    matrixAutoUpdateCount: 50,
    rendererPixelRatio: 3,
    antialias: true,
    ...partial,
  }
}

describe('resolveProfile', () => {
  it('returns explicit profiles unchanged', () => {
    expect(resolveProfile('cad', snap())).toBe('cad')
    expect(resolveProfile('game', snap())).toBe('game')
  })

  it('maps auto to cad, game, product, or marketing from snapshot heuristics', () => {
    expect(
      resolveProfile(
        'auto',
        snap({ meshCount: 201, drawCalls: 10, lightCount: 1, continuousFrameloop: false }),
      ),
    ).toBe('cad')
    expect(
      resolveProfile(
        'auto',
        snap({ meshCount: 10, drawCalls: 151, lightCount: 1, continuousFrameloop: false }),
      ),
    ).toBe('cad')
    expect(resolveProfile('auto', snap({ meshCount: 51, drawCalls: 10, lightCount: 4, textureCount: 10 }))).toBe('game')
    expect(resolveProfile('auto', snap({ meshCount: 20, drawCalls: 10, lightCount: 1, textureCount: 6 }))).toBe('product')
    expect(resolveProfile('auto', snap({ meshCount: 30, drawCalls: 10, lightCount: 1, textureCount: 10 }))).toBe('marketing')
  })

  it('prefers game over cad for a continuous high-mesh interactive scene', () => {
    expect(
      resolveProfile(
        'auto',
        snap({ meshCount: 220, drawCalls: 90, lightCount: 2, continuousFrameloop: true }),
      ),
    ).toBe('game')
  })

  it('prefers game for on-demand scenes with high draw activity (arcade racer)', () => {
    expect(
      resolveProfile(
        'auto',
        snap({ meshCount: 80, drawCalls: 133, lightCount: 2, textureCount: 12, continuousFrameloop: false }),
      ),
    ).toBe('game')
  })
})

describe('defaultRules and runRules', () => {
  it('registers v1 rules plus P2 triangles and culling', () => {
    expect(defaultRules.map((rule) => rule.id)).toEqual([
      'draw-calls',
      'triangles',
      'lights-shadows',
      'dpr',
      'materials',
      'textures',
      'renderer-setup',
      'lifecycle',
      'transforms',
      'culling',
      'frameloop',
    ])
  })

  it('aggregates findings from default rules on a stressed product snapshot', () => {
    const ctx: RuleContext = { snapshot: snap(), device, profile: 'product' }
    const ids = runRules(ctx).map((f) => f.id)
    expect(ids).toEqual(expect.arrayContaining([
      'draw-calls/too-many',
      'lights/too-many',
      'shadows/too-many-casters',
      'renderer/uncapped-dpr',
      'materials/too-unique',
      'textures/high-vram',
      'textures/oversized',
      'renderer/antialias-postfx-risk',
      'transforms/matrix-autoupdate',
      'frameloop/continuous-static',
    ]))
    expect(ids).not.toContain('lifecycle/resource-growth')
  })
})

describe('lifecycleRule', () => {
  it('emits nothing without a previous snapshot', () => {
    const ctx: RuleContext = { snapshot: snap(), device, profile: 'product' }
    expect(lifecycleRule.run(ctx)).toEqual([])
  })

  it('flags geometry or texture growth between measures', () => {
    const previous = snap({ geometryCount: 10, textureCount: 2 })
    const ctx: RuleContext = {
      snapshot: snap({ geometryCount: 12, textureCount: 5 }),
      previousSnapshot: previous,
      device,
      profile: 'product',
    }
    const hit = lifecycleRule.run(ctx).find((f) => f.id === 'lifecycle/resource-growth')
    expect(hit).toBeDefined()
    expect(hit?.evidence).toEqual({ geoGrowth: 2, texGrowth: 3 })
  })
})
