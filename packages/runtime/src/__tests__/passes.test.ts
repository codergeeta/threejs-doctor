import { describe, it, expect } from 'vitest'
import { dprCapPass } from '../passes/dpr-cap.js'
import { shadowBudgetPass } from '../passes/shadow-budget.js'
import { postfxBudgetPass } from '../passes/postfx-budget.js'
import { frameloopDemandPass } from '../passes/frameloop-demand.js'
import { distanceCullPass } from '../passes/distance-cull.js'
import { materialDowngradePass } from '../passes/material-downgrade.js'
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
