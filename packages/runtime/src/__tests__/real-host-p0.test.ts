import { describe, it, expect } from 'vitest'
import { Doctor } from '../doctor.js'
import { dprCapPass } from '../passes/dpr-cap.js'
import { distanceCullPass } from '../passes/distance-cull.js'
import { pixelBudgetPass } from '../passes/pixel-budget.js'
import { SAFE_PASSES } from '@threejs-doctor/core'
import type { PassContext } from '../passes/types.js'
import type { RendererInfoLike, SceneStatsLike } from '@threejs-doctor/core'

const lowDevice = {
  tier: 'low' as const,
  maxTextureSize: 4096,
  webgl: true,
  webgpu: false,
  devicePixelRatio: 3,
  hardwareConcurrency: 4,
}

const emptyInfo: RendererInfoLike = {
  render: { calls: 10, triangles: 1000 },
  memory: { geometries: 2, textures: 1 },
}

function stats(): SceneStatsLike {
  return {
    textureCount: 1,
    estimatedVramBytes: 1_000_000,
    geometryCount: 2,
    lightCount: 0,
    shadowCastingLightCount: 0,
  }
}

/** WebGLRenderer-shaped mock: getPixelRatio() exists, `.pixelRatio` does not. */
function webglLikeRenderer(opts?: {
  ratio?: number
  includeGetPixelRatio?: boolean
  antialiasAttr?: boolean
}) {
  const pixelRatioCalls: number[] = []
  let ratio = opts?.ratio ?? 2
  const includeGet = opts?.includeGetPixelRatio !== false
  const renderer: {
    info: RendererInfoLike
    drawingBufferWidth: number
    drawingBufferHeight: number
    getPixelRatio?: () => number
    setPixelRatio: (value: number) => void
    getContext: () => { getContextAttributes: () => { antialias: boolean } }
  } = {
    info: emptyInfo,
    drawingBufferWidth: 824,
    drawingBufferHeight: 1720,
    setPixelRatio(value: number) {
      pixelRatioCalls.push(value)
      if (!Number.isFinite(value)) {
        this.drawingBufferWidth = 0
        this.drawingBufferHeight = 0
        return
      }
      ratio = value
    },
    getContext() {
      return {
        getContextAttributes() {
          return { antialias: opts?.antialiasAttr ?? true }
        },
      }
    },
  }
  if (includeGet) {
    renderer.getPixelRatio = () => ratio
  }
  expect(Object.prototype.hasOwnProperty.call(renderer, 'pixelRatio')).toBe(false)
  expect(Object.prototype.hasOwnProperty.call(renderer, 'antialias')).toBe(false)
  return { renderer, pixelRatioCalls }
}

function passCtx(renderer: PassContext['renderer'], extra: Partial<PassContext> = {}): PassContext {
  return {
    renderer,
    scene: { children: [], traverse() {} },
    device: lowDevice,
    profile: 'product',
    postfxEnabled: false,
    frameloop: 'always',
    setFrameloop() {},
    ...extra,
  }
}

describe('P0: dpr-cap must not collapse a WebGLRenderer canvas', () => {
  it('never calls setPixelRatio with NaN when the renderer has no .pixelRatio property', () => {
    const { renderer, pixelRatioCalls } = webglLikeRenderer({ ratio: 3 })
    dprCapPass.apply(passCtx(renderer as never))
    expect(pixelRatioCalls.length).toBeGreaterThan(0)
    expect(pixelRatioCalls.every((v) => Number.isFinite(v))).toBe(true)
    expect(renderer.drawingBufferWidth).toBe(824)
    expect(renderer.drawingBufferHeight).toBe(1720)
  })

  it('caps using getPixelRatio() instead of the missing .pixelRatio field', () => {
    const { renderer, pixelRatioCalls } = webglLikeRenderer({ ratio: 3 })
    dprCapPass.apply(passCtx(renderer as never))
    expect(pixelRatioCalls).toEqual([1.5])
    expect(renderer.getPixelRatio?.()).toBe(1.5)
  })

  it('does not call setPixelRatio when pixel ratio cannot be read', () => {
    const { renderer, pixelRatioCalls } = webglLikeRenderer({
      includeGetPixelRatio: false,
    })
    dprCapPass.apply(passCtx(renderer as never))
    expect(pixelRatioCalls).toEqual([])
    expect(renderer.drawingBufferWidth).toBe(824)
    expect(renderer.drawingBufferHeight).toBe(1720)
  })

  it('pixel-budget uses getPixelRatio and never writes NaN', () => {
    const { renderer, pixelRatioCalls } = webglLikeRenderer({ ratio: 2 })
    pixelBudgetPass.apply(
      passCtx(renderer as never, {
        qualityTier: 'potato',
      }),
    )
    expect(pixelRatioCalls.every((v) => Number.isFinite(v))).toBe(true)
    expect(renderer.drawingBufferWidth).toBeGreaterThan(0)
    expect(renderer.drawingBufferHeight).toBeGreaterThan(0)
  })
})

describe('P0: uncapped-dpr / antialias snapshot on a real WebGLRenderer shape', () => {
  it('does not fire renderer/uncapped-dpr when pixel ratio is unknown', async () => {
    const { renderer } = webglLikeRenderer({ includeGetPixelRatio: false })
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'marketing',
      mode: 'diagnose',
      measureFrames: 2,
      device: lowDevice,
      now: (() => {
        let t = 0
        return () => {
          t += 16
          return t
        }
      })(),
      getSceneStats: stats,
    })
    const report = await doctor.diagnose()
    expect(report.findings.some((f) => f.id === 'renderer/uncapped-dpr')).toBe(false)
  })

  it('reads antialias from getContextAttributes, not renderer.antialias', async () => {
    const { renderer } = webglLikeRenderer({ ratio: 1, antialiasAttr: true })
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'marketing',
      mode: 'diagnose',
      measureFrames: 2,
      device: lowDevice,
      now: (() => {
        let t = 0
        return () => {
          t += 16
          return t
        }
      })(),
      getSceneStats: stats,
    })
    const report = await doctor.diagnose()
    expect(report.findings.some((f) => f.id === 'renderer/antialias-postfx-risk')).toBe(true)
  })
})

describe('P0: distance-cull must not hide nested scenery on default safe apply', () => {
  function nestedScene() {
    const mesh = {
      isMesh: true,
      visible: true,
      position: {
        x: 0,
        y: 0,
        z: 0,
        distanceTo(v: { x: number; y: number; z: number }) {
          return Math.hypot(0 - v.x, 0 - v.y, 0 - v.z)
        },
      },
      getWorldPosition(target: { x: number; y: number; z: number }) {
        target.x = 200
        target.y = 0
        target.z = 0
        return target
      },
    }
    const group = {
      isMesh: false,
      visible: true,
      position: { x: 200, y: 0, z: 0 },
      children: [mesh],
    }
    const scene = {
      children: [group],
      traverse(cb: (o: unknown) => void) {
        cb(group)
        cb(mesh)
      },
    }
    return { mesh, group, scene }
  }

  it('does not include distance-cull in SAFE_PASSES', () => {
    expect(SAFE_PASSES).not.toContain('distance-cull')
  })

  it('default safe optimize leaves a nested mesh at local (0,0,0) visible when the camera is far from origin', async () => {
    const { mesh, scene } = nestedScene()
    const { renderer } = webglLikeRenderer({ ratio: 1 })
    const doctor = new Doctor({
      scene: scene as never,
      camera: { position: { x: 200, y: 5, z: 10 } },
      renderer: renderer as never,
      profile: 'game',
      mode: 'optimize',
      measureFrames: 2,
      device: { ...lowDevice, tier: 'high' },
      now: (() => {
        let t = 0
        return () => {
          t += 16
          return t
        }
      })(),
      getSceneStats: stats,
    })
    const report = await doctor.optimize({ apply: ['safe'] })
    expect(report.appliedPasses).not.toContain('distance-cull')
    expect(mesh.visible).toBe(true)
  })

  it('named distance-cull still exists and uses world position so nested near-camera meshes stay visible', () => {
    const { mesh, scene } = nestedScene()
    distanceCullPass.apply(
      passCtx(webglLikeRenderer({ ratio: 1 }).renderer as never, {
        scene: scene as never,
        cameraPosition: { x: 200, y: 5, z: 10 },
        cullDistance: 80,
      }),
    )
    expect(mesh.visible).toBe(true)
  })

  it('named distance-cull hides meshes whose world position is beyond the cull distance', () => {
    const mesh = {
      isMesh: true,
      visible: true,
      position: {
        x: 0,
        y: 0,
        z: 0,
        distanceTo() {
          return 0
        },
      },
      getWorldPosition(target: { x: number; y: number; z: number }) {
        target.x = 1000
        target.y = 0
        target.z = 0
        return target
      },
    }
    const scene = {
      children: [mesh],
      traverse(cb: (o: typeof mesh) => void) {
        cb(mesh)
      },
    }
    const handle = distanceCullPass.apply(
      passCtx(webglLikeRenderer({ ratio: 1 }).renderer as never, {
        scene: scene as never,
        cameraPosition: { x: 0, y: 0, z: 0 },
        cullDistance: 80,
      }),
    )
    expect(mesh.visible).toBe(false)
    handle.rollback()
    expect(mesh.visible).toBe(true)
  })

  it('apply: ["aggressive"] opts into distance-cull', async () => {
    const { mesh, scene } = nestedScene()
    const farMesh = {
      isMesh: true,
      visible: true,
      position: {
        x: 0,
        y: 0,
        z: 0,
        distanceTo() {
          return 0
        },
      },
      getWorldPosition(target: { x: number; y: number; z: number }) {
        target.x = 1000
        target.y = 0
        target.z = 0
        return target
      },
    }
    const combined = {
      children: [...scene.children, farMesh],
      traverse(cb: (o: unknown) => void) {
        scene.traverse(cb)
        cb(farMesh)
      },
    }
    const { renderer } = webglLikeRenderer({ ratio: 1 })
    const doctor = new Doctor({
      scene: combined as never,
      camera: { position: { x: 200, y: 5, z: 10 } },
      renderer: renderer as never,
      profile: 'game',
      mode: 'optimize',
      measureFrames: 2,
      device: { ...lowDevice, tier: 'high' },
      now: (() => {
        let t = 0
        return () => {
          t += 16
          return t
        }
      })(),
      getSceneStats: stats,
    })
    const report = await doctor.optimize({ apply: ['aggressive'] })
    expect(report.appliedPasses).toContain('distance-cull')
    expect(mesh.visible).toBe(true)
    expect(farMesh.visible).toBe(false)
  })
})
