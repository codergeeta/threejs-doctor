import { describe, it, expect } from 'vitest'
import { defaultRules, runRules } from '../rule.js'
import type { RuleContext } from '../types.js'
import type { DeviceCapabilities, SceneSnapshot } from '@threejs-doctor/core'

const device: DeviceCapabilities = {
  tier: 'low',
  maxTextureSize: 4096,
  webgl: true,
  webgpu: false,
  devicePixelRatio: 2,
  hardwareConcurrency: 4,
}

function snap(partial: Partial<SceneSnapshot> = {}): SceneSnapshot {
  return {
    objectCount: 20,
    meshCount: 8,
    geometryCount: 8,
    materialCount: 4,
    textureCount: 3,
    estimatedVramBytes: 4_000_000,
    lightCount: 2,
    shadowCastingLightCount: 1,
    drawCalls: 40,
    triangles: 8_000,
    maxTextureDimension: 1024,
    continuousFrameloop: true,
    matrixAutoUpdateCount: 0,
    rendererPixelRatio: 1,
    antialias: false,
    ...partial,
  }
}

describe('P2 finding rules', () => {
  it('registers triangles and culling rules alongside v1', () => {
    expect(defaultRules.map((rule) => rule.id)).toEqual(expect.arrayContaining(['triangles', 'culling']))
  })

  it('emits triangles/too-many with the heavy hitter when drawn triangles exceed budget', () => {
    const ctx: RuleContext = {
      device,
      profile: 'marketing',
      snapshot: snap({
        triangles: 100_000,
        geometryTriangleCount: 100_000,
        triangleContributorSummary: 'trees:82000',
        topContributorShare: 0.82,
      }),
    }
    const hit = runRules(ctx).find((f) => f.id === 'triangles/too-many')
    expect(hit).toBeDefined()
    expect(hit?.evidence.topContributor).toBe('trees:82000')
    expect(hit?.evidence.topContributorShare).toBe(0.82)
    expect(hit?.evidence.triangles).toBe(100_000)
  })

  it('does not fire triangles/too-many on leftover geometry when drawn triangles are in budget', () => {
    const ctx: RuleContext = {
      device,
      profile: 'marketing',
      snapshot: snap({
        triangles: 21_000,
        geometryTriangleCount: 880_000,
        triangleContributorSummary: 'trees:820000',
        topContributorShare: 0.93,
      }),
    }
    expect(runRules(ctx).some((f) => f.id === 'triangles/too-many')).toBe(false)
  })

  it('emits culling findings from counted disabled/oversized meshes', () => {
    const ctx: RuleContext = {
      device,
      profile: 'game',
      snapshot: snap({
        frustumCulledDisabledCount: 3,
        oversizedBoundCount: 1,
      }),
    }
    const ids = runRules(ctx).map((f) => f.id)
    expect(ids).toContain('culling/frustum-disabled')
    expect(ids).toContain('culling/oversized-bounds')
  })

  it('emits shadow cost findings only when shadow fields are present', () => {
    const withData: RuleContext = {
      device,
      profile: 'marketing',
      snapshot: snap({
        shadowTriangleCount: 200_000,
        shadowCastersOutsideFrustum: 4,
      }),
    }
    const ids = runRules(withData).map((f) => f.id)
    expect(ids).toContain('shadows/expensive-pass')
    expect(ids).toContain('shadows/casters-outside-frustum')

    const omitted: RuleContext = { device, profile: 'marketing', snapshot: snap() }
    const omittedIds = runRules(omitted).map((f) => f.id)
    expect(omittedIds).not.toContain('shadows/expensive-pass')
    expect(omittedIds).not.toContain('shadows/casters-outside-frustum')
  })

  it('emits composer mismatch from measured composer vs drawing-buffer sizes', () => {
    const ctx: RuleContext = {
      device,
      profile: 'game',
      snapshot: snap({
        composerPixelRatio: 1,
        composerWidth: 800,
        composerHeight: 450,
        drawingBufferWidth: 1600,
        drawingBufferHeight: 900,
        rendererPixelRatio: 2,
      }),
    }
    expect(runRules(ctx).some((f) => f.id === 'renderer/composer-resolution-mismatch')).toBe(true)
  })

  it('emits lights/zero-intensity when counted, not when omitted', () => {
    const hit = runRules({
      device,
      profile: 'product',
      snapshot: snap({ zeroIntensityLightCount: 2 }),
    }).find((f) => f.id === 'lights/zero-intensity')
    expect(hit).toBeDefined()
    expect(hit?.suggestedFix).not.toMatch(/visible\s*=\s*false/i)
    expect(hit?.suggestedFix).not.toMatch(/intensity\s*=\s*0/i)
    expect(hit?.suggestedFix).toMatch(/fixed[\s-]*size|pool/i)
    expect(hit?.suggestedFix).toMatch(/compile/i)
    expect(runRules({ device, profile: 'product', snapshot: snap() }).some((f) => f.id === 'lights/zero-intensity')).toBe(
      false,
    )
  })

  it('emits lifecycle/instance-buffer-growth across snapshots', () => {
    const previous = snap({ instancedBufferBytes: 512 })
    const current = snap({ instancedBufferBytes: 4096, geometryCount: 8, textureCount: 3 })
    const hit = runRules({
      device,
      profile: 'game',
      snapshot: current,
      previousSnapshot: previous,
    }).find((f) => f.id === 'lifecycle/instance-buffer-growth')
    expect(hit).toBeDefined()
    expect(runRules({ device, profile: 'game', snapshot: current }).some((f) => f.id === 'lifecycle/instance-buffer-growth')).toBe(
      false,
    )
  })
})
