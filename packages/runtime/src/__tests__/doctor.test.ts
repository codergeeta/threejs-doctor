import { describe, it, expect } from 'vitest'
import { Doctor } from '../doctor.js'
import { SAFE_PASSES, type RendererInfoLike, type SceneStatsLike } from '@threejs-doctor/core'

function createHarness(opts?: {
  getSceneStats?: () => SceneStatsLike
  now?: () => number
  setPixelRatio?: (v: number) => void
  setFrameloop?: (mode: 'always' | 'demand') => void
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
    setFrameloop: opts?.setFrameloop,
  })
  return { doctor, renderer, lights }
}

describe('Doctor', () => {
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

  it('does not apply material-downgrade in the default safe set', async () => {
    const { doctor } = createHarness()
    const report = await doctor.optimize({ apply: ['safe'] })
    expect(report.appliedPasses).toEqual([...SAFE_PASSES])
    expect(report.appliedPasses).not.toContain('material-downgrade')
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
})
