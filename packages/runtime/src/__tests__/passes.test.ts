import { describe, it, expect } from 'vitest'
import { dprCapPass } from '../passes/dpr-cap.js'
import { shadowBudgetPass } from '../passes/shadow-budget.js'
import { postfxBudgetPass } from '../passes/postfx-budget.js'
import { frameloopDemandPass } from '../passes/frameloop-demand.js'
import { distanceCullPass } from '../passes/distance-cull.js'
import { materialDowngradePass } from '../passes/material-downgrade.js'
import { pixelBudgetPass } from '../passes/pixel-budget.js'
import { toneMapLitePass } from '../passes/tone-map-lite.js'
import { anisotropyCapPass } from '../passes/anisotropy-cap.js'
import { SAFE_PASSES } from '@threejs-doctor/core'
import type { PassContext } from '../passes/types.js'

const lowDevice = {
  tier: 'low' as const,
  maxTextureSize: 4096,
  webgl: true,
  webgpu: false,
  devicePixelRatio: 3,
  hardwareConcurrency: 4,
}

function baseCtx(overrides: Partial<PassContext> = {}): PassContext {
  return {
    renderer: {
      pixelRatio: 1,
      setPixelRatio() {},
      info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } },
    },
    scene: { children: [], traverse() {} },
    device: lowDevice,
    profile: 'product',
    postfxEnabled: false,
    frameloop: 'always',
    setFrameloop() {},
    ...overrides,
  }
}

describe('safe passes', () => {
  it('dpr-cap lowers pixel ratio and rollbacks', () => {
    const renderer = {
      pixelRatio: 3,
      setPixelRatio(v: number) { this.pixelRatio = v },
    }
    const handle = dprCapPass.apply({
      renderer: renderer as never,
      scene: { children: [], traverse() {} } as never,
      device: {
        tier: 'low', maxTextureSize: 4096, webgl: true, webgpu: false,
        devicePixelRatio: 3, hardwareConcurrency: 4,
      },
      profile: 'marketing',
      postfxEnabled: true,
      frameloop: 'always',
      setFrameloop(v) { this.frameloop = v },
    })
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.5)
    handle.rollback()
    expect(renderer.pixelRatio).toBe(3)
  })

  it('shadow-budget disables excess casters and rollbacks', () => {
    const lights = [
      { castShadow: true },
      { castShadow: true },
      { castShadow: true },
    ]
    const scene = {
      children: lights,
      traverse(cb: (o: { castShadow?: boolean }) => void) {
        for (const l of lights) cb(l)
      },
    }
    const handle = shadowBudgetPass.apply({
      renderer: { pixelRatio: 1, setPixelRatio() {} } as never,
      scene: scene as never,
      device: {
        tier: 'low', maxTextureSize: 4096, webgl: true, webgpu: false,
        devicePixelRatio: 2, hardwareConcurrency: 4,
      },
      profile: 'product',
      postfxEnabled: false,
      frameloop: 'always',
      setFrameloop() {},
    })
    expect(lights.filter((l) => l.castShadow).length).toBeLessThanOrEqual(2)
    handle.rollback()
    expect(lights.every((l) => l.castShadow)).toBe(true)
  })

  it('shadow-budget does not spend budget on mesh.castShadow', () => {
    const lights = [
      { isLight: true, castShadow: true },
      { isLight: true, castShadow: true },
      { isLight: true, castShadow: true },
    ]
    const mesh = { isMesh: true, castShadow: true }
    const scene = {
      children: [...lights, mesh],
      traverse(cb: (o: { castShadow?: boolean }) => void) {
        for (const l of lights) cb(l)
        cb(mesh)
      },
    }
    shadowBudgetPass.apply(
      baseCtx({
        scene: scene as never,
        profile: 'product',
      }),
    )
    expect(mesh.castShadow).toBe(true)
    expect(lights.filter((l) => l.castShadow).length).toBe(2)
  })

  it('postfx-budget disables postfx on low-tier and rollbacks', () => {
    let enabled = true
    const ctx = baseCtx({
      postfxEnabled: true,
      setPostfxEnabled(v) {
        enabled = v
      },
    })
    const handle = postfxBudgetPass.apply(ctx)
    expect(enabled).toBe(false)
    handle.rollback()
    expect(enabled).toBe(true)
  })

  it('frameloop-demand switches marketing/product to demand and rollbacks', () => {
    let mode: 'always' | 'demand' = 'always'
    const ctx = baseCtx({
      profile: 'marketing',
      frameloop: 'always',
      setFrameloop(v) {
        mode = v
      },
    })
    const handle = frameloopDemandPass.apply(ctx)
    expect(mode).toBe('demand')
    handle.rollback()
    expect(mode).toBe('always')
  })

  it('distance-cull hides far meshes and rollbacks', () => {
    const near = {
      isMesh: true,
      visible: true,
      position: { distanceTo: () => 10 },
    }
    const far = {
      isMesh: true,
      visible: true,
      position: { distanceTo: () => 200 },
    }
    const scene = {
      children: [near, far],
      traverse(cb: (o: typeof near) => void) {
        cb(near)
        cb(far)
      },
    }
    const handle = distanceCullPass.apply(
      baseCtx({
        scene: scene as never,
        cameraPosition: { x: 0, y: 0, z: 0 },
        cullDistance: 80,
      }),
    )
    expect(near.visible).toBe(true)
    expect(far.visible).toBe(false)
    handle.rollback()
    expect(far.visible).toBe(true)
  })

  it('material-downgrade is a no-op that still exposes rollback', () => {
    const handle = materialDowngradePass.apply(baseCtx())
    expect(typeof handle.rollback).toBe('function')
    expect(() => handle.rollback()).not.toThrow()
  })

  it('dpr-cap restores pixel ratio when setPixelRatio throws after mutating', () => {
    const renderer = {
      pixelRatio: 3,
      setPixelRatio(v: number) {
        this.pixelRatio = v
        throw new Error('dpr failed')
      },
    }
    expect(() =>
      dprCapPass.apply(
        baseCtx({
          renderer: renderer as never,
          device: { ...lowDevice, tier: 'low' },
        }),
      ),
    ).toThrow('dpr failed')
    expect(renderer.pixelRatio).toBe(3)
  })
})

describe('v2 generic passes', () => {
  it('lists v2 passes in safe apply order and keeps material-downgrade out', () => {
    expect(SAFE_PASSES).toEqual([
      'dpr-cap',
      'pixel-budget',
      'shadow-budget',
      'postfx-budget',
      'tone-map-lite',
      'anisotropy-cap',
      'frameloop-demand',
      'distance-cull',
    ])
    expect(SAFE_PASSES).not.toContain('material-downgrade')
  })

  it('pixel-budget lowers drawing-buffer pixels to the tier cap and rollbacks', () => {
    const renderer = {
      pixelRatio: 2,
      drawingBufferWidth: 2000,
      drawingBufferHeight: 2000,
      setPixelRatio(v: number) {
        this.pixelRatio = v
      },
      setDrawingBufferSize(w: number, h: number, pr: number) {
        this.drawingBufferWidth = w
        this.drawingBufferHeight = h
        this.pixelRatio = pr
      },
    }
    const handle = pixelBudgetPass.apply(
      baseCtx({
        renderer: renderer as never,
        qualityTier: 'potato',
      }),
    )
    const pixels = renderer.drawingBufferWidth * renderer.drawingBufferHeight
    expect(pixels).toBeLessThanOrEqual(1.2e6)
    expect(renderer.pixelRatio).toBeLessThanOrEqual(2)
    handle.rollback()
    expect(renderer.drawingBufferWidth).toBe(2000)
    expect(renderer.drawingBufferHeight).toBe(2000)
    expect(renderer.pixelRatio).toBe(2)
  })

  it('pixel-budget does not raise DPR when already under the pixel cap', () => {
    const renderer = {
      pixelRatio: 0.5,
      drawingBufferWidth: 400,
      drawingBufferHeight: 400,
      setPixelRatio(v: number) {
        this.pixelRatio = v
      },
    }
    pixelBudgetPass.apply(
      baseCtx({
        renderer: renderer as never,
        qualityTier: 'potato',
      }),
    )
    expect(renderer.pixelRatio).toBe(0.5)
  })

  it('pixel-budget is a no-op on high when no drawing-buffer cap applies', () => {
    const renderer = {
      pixelRatio: 2,
      drawingBufferWidth: 3000,
      drawingBufferHeight: 2000,
      setPixelRatio(v: number) {
        this.pixelRatio = v
      },
    }
    pixelBudgetPass.apply(
      baseCtx({
        renderer: renderer as never,
        qualityTier: 'high',
      }),
    )
    expect(renderer.pixelRatio).toBe(2)
    expect(renderer.drawingBufferWidth).toBe(3000)
  })

  it('tone-map-lite sets NoToneMapping on potato and rollbacks', () => {
    const renderer = { pixelRatio: 1, toneMapping: 4, setPixelRatio() {} }
    const handle = toneMapLitePass.apply(
      baseCtx({ renderer: renderer as never, qualityTier: 'potato' }),
    )
    expect(renderer.toneMapping).toBe(0)
    handle.rollback()
    expect(renderer.toneMapping).toBe(4)
  })

  it('tone-map-lite sets LinearToneMapping on low', () => {
    const renderer = { pixelRatio: 1, toneMapping: 4, setPixelRatio() {} }
    toneMapLitePass.apply(baseCtx({ renderer: renderer as never, qualityTier: 'low' }))
    expect(renderer.toneMapping).toBe(1)
  })

  it('tone-map-lite skips when toneMapping is missing or tier is mid/high', () => {
    const missing = { pixelRatio: 1, setPixelRatio() {} }
    toneMapLitePass.apply(baseCtx({ renderer: missing as never, qualityTier: 'potato' }))
    expect('toneMapping' in missing).toBe(false)
    const host = { pixelRatio: 1, toneMapping: 4, setPixelRatio() {} }
    toneMapLitePass.apply(baseCtx({ renderer: host as never, qualityTier: 'mid' }))
    expect(host.toneMapping).toBe(4)
  })

  it('anisotropy-cap lowers texture anisotropy and rollbacks', () => {
    const tex = { anisotropy: 8 }
    const scene = {
      children: [],
      traverse(cb: (o: { material?: { map?: { anisotropy: number } } }) => void) {
        cb({ material: { map: tex } })
      },
    }
    const handle = anisotropyCapPass.apply(
      baseCtx({ scene: scene as never, qualityTier: 'potato' }),
    )
    expect(tex.anisotropy).toBe(1)
    handle.rollback()
    expect(tex.anisotropy).toBe(8)
  })

  it('anisotropy-cap skips objects without anisotropy', () => {
    const mat = { uuid: 'm' }
    const scene = {
      children: [],
      traverse(cb: (o: { material?: { uuid: string } }) => void) {
        cb({ material: mat })
      },
    }
    const handle = anisotropyCapPass.apply(
      baseCtx({ scene: scene as never, qualityTier: 'low' }),
    )
    expect(mat).toEqual({ uuid: 'm' })
    handle.rollback()
  })

  it('shadow-budget potato disables all casters and shadowMap.enabled, then rollbacks', () => {
    const lights = [{ castShadow: true }, { castShadow: true }]
    const renderer = {
      pixelRatio: 1,
      setPixelRatio() {},
      shadowMap: { enabled: true },
    }
    const scene = {
      children: lights,
      traverse(cb: (o: { castShadow?: boolean }) => void) {
        for (const l of lights) cb(l)
      },
    }
    const handle = shadowBudgetPass.apply(
      baseCtx({
        renderer: renderer as never,
        scene: scene as never,
        qualityTier: 'potato',
      }),
    )
    expect(lights.every((l) => l.castShadow === false)).toBe(true)
    expect(renderer.shadowMap.enabled).toBe(false)
    handle.rollback()
    expect(lights.every((l) => l.castShadow)).toBe(true)
    expect(renderer.shadowMap.enabled).toBe(true)
  })

  it('shadow-budget without qualityTier still keeps v1 product budget of 2', () => {
    const lights = [{ castShadow: true }, { castShadow: true }, { castShadow: true }]
    const scene = {
      children: lights,
      traverse(cb: (o: { castShadow?: boolean }) => void) {
        for (const l of lights) cb(l)
      },
    }
    shadowBudgetPass.apply(baseCtx({ scene: scene as never, profile: 'product' }))
    expect(lights.filter((l) => l.castShadow).length).toBe(2)
  })
})
