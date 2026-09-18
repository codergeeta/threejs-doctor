import { describe, it, expect } from 'vitest'
import { Doctor } from '../doctor.js'
import { SAFE_PASSES, type RendererInfoLike, type SceneStatsLike } from '@threejs-doctor/core'

function createHarness(opts?: {
  getSceneStats?: () => SceneStatsLike
  now?: () => number
  setPixelRatio?: (v: number) => void
  setFrameloop?: (mode: 'always' | 'demand') => void
  waitFrame?: () => Promise<void>
}) {
  const info: RendererInfoLike = {
    render: { calls: 180, triangles: 40_000 },
    memory: { geometries: 40, textures: 8 },
  }
  const lights = [{ castShadow: true }, { castShadow: true }, { castShadow: true }]
  const renderer = {
    info,
    pixelRatio: 3,
    antialias: true,
    setPixelRatio(v: number) {
      if (opts?.setPixelRatio) {
        opts.setPixelRatio(v)
        return
      }
      this.pixelRatio = v
    },
  }
  const scene = {
    children: lights,
    traverse(cb: (o: Record<string, unknown>) => void) {
      for (const l of lights) cb(l as never)
      cb({
        isMesh: true,
        geometry: { uuid: 'g1' },
        material: { uuid: 'm1' },
        matrixAutoUpdate: true,
      })
    },
  }
  let t = 0
  const doctor = new Doctor({
    scene: scene as never,
    camera: {},
    renderer: renderer as never,
    profile: 'marketing',
    mode: 'optimize',
    measureFrames: 5,
    now:
      opts?.now ??
      (() => {
        t += 16
        return t
      }),
    getSceneStats:
      opts?.getSceneStats ??
      (() => ({
        textureCount: 8,
        estimatedVramBytes: 32_000_000,
        geometryCount: 40,
        lightCount: 3,
        shadowCastingLightCount: lights.filter((l) => l.castShadow).length,
      })),
    ...(opts?.setFrameloop ? { setFrameloop: opts.setFrameloop } : {}),
    ...(opts?.waitFrame ? { waitFrame: opts.waitFrame } : {}),
  })
  return { doctor, renderer, lights }
}

describe('Doctor', () => {
  it('awaits waitFrame between begin and end of each measured frame', async () => {
    let waits = 0
    let t = 0
    const { doctor } = createHarness({
      now: () => {
        t += 16
        return t
      },
      waitFrame: async () => {
        waits += 1
      },
    })
    const sample = await doctor.measure(3)
    expect(waits).toBe(3)
    expect(sample.avgFps).toBe(62.5)
  })

  it('samples drawingBufferPixels when the renderer exposes width and height', async () => {
    const { doctor, renderer } = createHarness()
    const r = renderer as { drawingBufferWidth?: number; drawingBufferHeight?: number }
    r.drawingBufferWidth = 800
    r.drawingBufferHeight = 600
    const sample = await doctor.measure()
    expect(sample.drawingBufferPixels).toBe(800 * 600)
  })

  it('omits drawingBufferPixels when the renderer has no drawing buffer', async () => {
    const { doctor } = createHarness()
    const sample = await doctor.measure()
    expect(Object.prototype.hasOwnProperty.call(sample, 'drawingBufferPixels')).toBe(false)
  })

  it('measure → diagnose → optimize returns deltas', async () => {
    const { doctor, renderer } = createHarness()
    const baseline = await doctor.measure()
    expect(baseline.drawCalls).toBe(180)
    const report = await doctor.optimize({ apply: ['safe'] })
    expect(report.baseline.drawCalls).toBe(180)
    expect(report.appliedPasses.length).toBeGreaterThan(0)
    expect(report.score).toBeGreaterThanOrEqual(0)
    expect(report.score).toBeLessThanOrEqual(100)
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.5)
    if (report.after) {
      expect(report.deltas).toBeDefined()
    }
  })

  it('does not apply material-downgrade or distance-cull in the default safe set', async () => {
    const { doctor } = createHarness()
    const report = await doctor.optimize({ apply: ['safe'] })
    expect(report.appliedPasses).toEqual([...SAFE_PASSES])
    expect(report.appliedPasses).not.toContain('material-downgrade')
    expect(report.appliedPasses).not.toContain('distance-cull')
  })

  it('applies material-downgrade only when opted in', async () => {
    const { doctor } = createHarness()
    const report = await doctor.optimize({ apply: ['material-downgrade'] })
    expect(report.appliedPasses).toEqual(['material-downgrade'])
  })

  it('threads previousSnapshot so lifecycle findings can fire across measures', async () => {
    let samples = 0
    const { doctor } = createHarness({
      getSceneStats: () => {
        samples += 1
        return {
          textureCount: 8 + samples,
          estimatedVramBytes: 32_000_000,
          geometryCount: 40 + samples,
          lightCount: 3,
          shadowCastingLightCount: 3,
        }
      },
    })
    await doctor.measure()
    await doctor.measure()
    const report = await doctor.diagnose()
    expect(report.findings.some((f) => f.id === 'lifecycle/resource-growth')).toBe(true)
  })

  it('rolls back a failed pass, continues others, and records failedPasses', async () => {
    const { doctor, renderer } = createHarness({
      setPixelRatio: () => {
        throw new Error('cannot cap dpr')
      },
    })
    const report = await doctor.optimize({ apply: ['safe'] })
    expect(report.failedPasses.some((f) => f.id === 'dpr-cap')).toBe(true)
    expect(report.appliedPasses).not.toContain('dpr-cap')
    expect(report.appliedPasses.length).toBeGreaterThan(0)
    expect(renderer.pixelRatio).toBe(3)
  })

  it('keeps baseline and marks incomplete when after-measure fails', async () => {
    let samples = 0
    const { doctor } = createHarness({
      getSceneStats: () => {
        samples += 1
        if (samples >= 2) throw new Error('after measure failed')
        return {
          textureCount: 8,
          estimatedVramBytes: 32_000_000,
          geometryCount: 40,
          lightCount: 3,
          shadowCastingLightCount: 3,
        }
      },
    })
    const baseline = await doctor.measure()
    const report = await doctor.optimize({ apply: ['safe'] })
    expect(report.incomplete).toBe(true)
    expect(report.after).toBeUndefined()
    expect(report.deltas).toBeUndefined()
    expect(report.baseline.drawCalls).toBe(baseline.drawCalls)
  })

  it('walks the scene so transform findings can fire', async () => {
    const objects = Array.from({ length: 12 }, () => ({ matrixAutoUpdate: true }))
    const info: RendererInfoLike = {
      render: { calls: 20, triangles: 1000 },
      memory: { geometries: 12, textures: 1 },
    }
    const renderer = {
      info,
      pixelRatio: 1,
      antialias: false,
      setPixelRatio(v: number) {
        this.pixelRatio = v
      },
    }
    const doctor = new Doctor({
      scene: {
        children: objects,
        traverse(cb: (o: Record<string, unknown>) => void) {
          for (const o of objects) cb(o)
        },
      } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'product',
      mode: 'diagnose',
      measureFrames: 2,
      now: (() => {
        let t = 0
        return () => {
          t += 16
          return t
        }
      })(),
      getSceneStats: () => ({
        textureCount: 1,
        estimatedVramBytes: 1_000_000,
        geometryCount: 12,
        lightCount: 1,
        shadowCastingLightCount: 0,
      }),
    })
    const report = await doctor.diagnose()
    expect(report.findings.some((f) => f.id === 'transforms/matrix-autoupdate')).toBe(true)
  })

  it('does not claim demand frameloop when the host provided no setter', async () => {
    const { doctor } = createHarness()
    await doctor.optimize({ apply: ['frameloop-demand'] })
    const report = await doctor.diagnose()
    expect(report.findings.some((f) => f.id === 'frameloop/continuous-static')).toBe(true)
  })

  it('applyPassesImmediate does not call measure or write after metrics', async () => {
    const { doctor, renderer } = createHarness()
    const before = renderer.pixelRatio
    const result = doctor.applyPassesImmediate(['dpr-cap'])
    expect(result.appliedPasses).toContain('dpr-cap')
    expect(renderer.pixelRatio).toBeLessThan(before)
    doctor.rollbackAll()
    expect(renderer.pixelRatio).toBe(before)
  })

  it('forceDrawingBufferPixels treats setDrawingBufferSize args as CSS size (Three.js)', () => {
    const renderer = {
      info: {
        render: { calls: 1, triangles: 1 },
        memory: { geometries: 1, textures: 1 },
      },
      pixelRatio: 0.5,
      drawingBufferWidth: 2000,
      drawingBufferHeight: 2000,
      setPixelRatio(v: number) {
        this.pixelRatio = v
      },
      setDrawingBufferSize(width: number, height: number, pixelRatio: number) {
        this.pixelRatio = pixelRatio
        this.drawingBufferWidth = Math.max(1, Math.floor(width * pixelRatio))
        this.drawingBufferHeight = Math.max(1, Math.floor(height * pixelRatio))
      },
    }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      mode: 'optimize',
      measureFrames: 1,
      now: (() => {
        let t = 0
        return () => {
          t += 16
          return t
        }
      })(),
      getSceneStats: () => ({
        textureCount: 0,
        estimatedVramBytes: 0,
        geometryCount: 0,
        lightCount: 0,
        shadowCastingLightCount: 0,
      }),
    })
    doctor.forceDrawingBufferPixels(6e5)
    const pixels = renderer.drawingBufferWidth * renderer.drawingBufferHeight
    expect(pixels).toBeLessThanOrEqual(6e5)
    expect(pixels).toBeGreaterThan(6e5 * 0.5)
  })
})
