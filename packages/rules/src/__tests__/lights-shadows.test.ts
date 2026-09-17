import { describe, it, expect } from 'vitest'
import { lightsShadowsRule } from '../rules/lights-shadows.js'
import type { RuleContext } from '../types.js'
import type { DeviceCapabilities, SceneSnapshot } from '@threejs-doctor/core'

const device: DeviceCapabilities = {
  tier: 'mid', maxTextureSize: 8192, webgl: true, webgpu: false,
  devicePixelRatio: 1, hardwareConcurrency: 8,
}

const base: SceneSnapshot = {
  objectCount: 20, meshCount: 10, geometryCount: 10, materialCount: 4,
  textureCount: 2, estimatedVramBytes: 2_000_000, lightCount: 6,
  shadowCastingLightCount: 4, drawCalls: 30, triangles: 10_000,
  maxTextureDimension: 1024, continuousFrameloop: true,
  matrixAutoUpdateCount: 0, rendererPixelRatio: 1, antialias: true,
}

describe('lightsShadowsRule', () => {
  it('flags too many shadow casters with autoFix shadow-budget', () => {
    const ctx: RuleContext = { snapshot: base, device, profile: 'product' }
    const findings = lightsShadowsRule.run(ctx)
    const hit = findings.find((f) => f.id === 'shadows/too-many-casters')
    expect(hit).toBeDefined()
    expect(hit?.autoFix).toBe('shadow-budget')
  })
})
