import { describe, it, expect } from 'vitest'
import { Doctor } from '../doctor.js'

function clock(step = 16) {
  let t = 0
  return () => {
    t += step
    return t
  }
}

describe('P0: visual rollback undoes only the current optimize() handles', () => {
  it('keeps an earlier accepted optimize after a later visual-gate failure', async () => {
    const baseline = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255])
    const afterPix = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255])
    let captures = 0
    const renderer = {
      pixelRatio: 3,
      shadowMap: { enabled: true },
      getPixelRatio() {
        return this.pixelRatio
      },
      setPixelRatio(v: number) {
        this.pixelRatio = v
      },
      info: { render: { calls: 20, triangles: 4_000 }, memory: { geometries: 2, textures: 1 } },
      render() {},
    }
    const lights = [{ castShadow: true }, { castShadow: true }, { castShadow: true }]
    const doctor = new Doctor({
      scene: {
        children: lights,
        traverse(cb: (o: Record<string, unknown>) => void) {
          for (const l of lights) cb(l as never)
        },
      } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'marketing',
      measureFrames: 1,
      now: clock(),
      device: {
        tier: 'low',
        maxTextureSize: 4096,
        webgl: true,
        webgpu: false,
        devicePixelRatio: 3,
        hardwareConcurrency: 4,
      },
    })

    const accepted = await doctor.optimize({ apply: ['dpr-cap'] })
    expect(accepted.visualDelta).toBeUndefined()
    expect(accepted.appliedPasses).toContain('dpr-cap')
    const cappedRatio = renderer.pixelRatio
    expect(cappedRatio).toBeLessThan(3)
    const acceptedAfter = accepted.after

    const rejected = await doctor.optimize({
      apply: ['shadow-budget'],
      visualGate: {
        capture() {
          captures += 1
          return captures <= 2 ? baseline : afterPix
        },
        maxChangedRatio: 0.05,
      },
    })

    expect(captures).toBeGreaterThanOrEqual(4)
    expect(rejected.visualDelta).toBe(true)
    expect(rejected.rolledBackDueToVisual).toBe(true)
    expect(renderer.pixelRatio).toBe(cappedRatio)
    expect(rejected.appliedPasses).toContain('dpr-cap')
    expect(rejected.appliedPasses).not.toContain('shadow-budget')
    expect(rejected.after).toEqual(acceptedAfter ?? rejected.baseline)
    expect(rejected.deltas).toBeUndefined()
  })

  it('clears the rejected attempt from appliedPasses/after/deltas when there was no prior optimize', async () => {
    const baseline = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255])
    const afterPix = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255])
    let captures = 0
    const renderer = {
      pixelRatio: 3,
      getPixelRatio() {
        return this.pixelRatio
      },
      setPixelRatio(v: number) {
        this.pixelRatio = v
      },
      info: { render: { calls: 20, triangles: 4_000 }, memory: { geometries: 2, textures: 1 } },
      render() {},
    }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: renderer as never,
      profile: 'marketing',
      measureFrames: 1,
      now: clock(),
      device: {
        tier: 'low',
        maxTextureSize: 4096,
        webgl: true,
        webgpu: false,
        devicePixelRatio: 3,
        hardwareConcurrency: 4,
      },
    })
    const report = await doctor.optimize({
      apply: ['dpr-cap'],
      visualGate: {
        capture() {
          captures += 1
          return captures <= 2 ? baseline : afterPix
        },
        maxChangedRatio: 0.05,
      },
    })
    expect(report.visualDelta).toBe(true)
    expect(report.rolledBackDueToVisual).toBe(true)
    expect(report.appliedPasses).toEqual([])
    expect(report.after).toEqual(report.baseline)
    expect(report.deltas).toBeUndefined()
    expect(renderer.pixelRatio).toBe(3)
  })
})
