import { describe, it, expect } from 'vitest'
import { dprRule } from '../rules/dpr.js'
import type { RuleContext } from '../types.js'
import type { DeviceCapabilities, SceneSnapshot } from '@threejs-doctor/core'

describe('dprRule', () => {
  it('warns on uncapped DPR for marketing on low tier', () => {
    const device: DeviceCapabilities = {
      tier: 'low', maxTextureSize: 4096, webgl: true, webgpu: false,
      devicePixelRatio: 3, hardwareConcurrency: 4,
    }
    const snapshot: SceneSnapshot = {
      objectCount: 5, meshCount: 2, geometryCount: 2, materialCount: 2,
      textureCount: 2, estimatedVramBytes: 4_000_000, lightCount: 1,
      shadowCastingLightCount: 0, drawCalls: 5, triangles: 2000,
      maxTextureDimension: 2048, continuousFrameloop: true,
      matrixAutoUpdateCount: 0, rendererPixelRatio: 3, antialias: true,
    }
    const ctx: RuleContext = { snapshot, device, profile: 'marketing' }
    const findings = dprRule.run(ctx)
    expect(findings.some((f) => f.id === 'renderer/uncapped-dpr')).toBe(true)
    expect(findings[0]?.autoFix).toBe('dpr-cap')
  })
})
