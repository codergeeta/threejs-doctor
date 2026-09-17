import { describe, it, expect } from 'vitest'
import { drawCallsRule } from '../rules/draw-calls.js'
import type { RuleContext } from '../types.js'
import type { SceneSnapshot, DeviceCapabilities } from '@threejs-doctor/core'

const device: DeviceCapabilities = {
  tier: 'low',
  maxTextureSize: 4096,
  webgl: true,
  webgpu: false,
  devicePixelRatio: 2,
  hardwareConcurrency: 4,
}

function snap(partial: Partial<SceneSnapshot>): SceneSnapshot {
  return {
    objectCount: 100,
    meshCount: 80,
    geometryCount: 80,
    materialCount: 10,
    textureCount: 5,
    estimatedVramBytes: 1_000_000,
    lightCount: 1,
    shadowCastingLightCount: 0,
    drawCalls: 200,
    triangles: 50_000,
    maxTextureDimension: 1024,
    continuousFrameloop: true,
    matrixAutoUpdateCount: 0,
    rendererPixelRatio: 2,
    antialias: false,
    ...partial,
  }
}

describe('drawCallsRule', () => {
  it('emits error when draw calls exceed cad budget', () => {
    const ctx: RuleContext = { snapshot: snap({ drawCalls: 250 }), device, profile: 'cad' }
    const findings = drawCallsRule.run(ctx)
    expect(findings.some((f) => f.id === 'draw-calls/too-many')).toBe(true)
    expect(findings[0]?.severity).toBe('error')
  })
})
