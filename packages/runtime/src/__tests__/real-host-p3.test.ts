import { describe, it, expect, afterEach } from 'vitest'
import { Doctor } from '../doctor.js'
import { compareAbSamples, classifyVisualSafety, pixelChangedRatio } from '@threejs-doctor/core'

function clock(step = 16) {
  let t = 0
  return () => {
    t += step
    return t
  }
}

function rendererStub() {
  return {
    info: {
      render: { calls: 20, triangles: 4_000 },
      memory: { geometries: 2, textures: 1 },
    },
    setPixelRatio() {},
    render() {},
  }
}

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})

describe('P3: invalid when hidden or throttled', () => {
  it('marks measure invalid+incomplete when the document is hidden (live clock)', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: rendererStub() as never,
      profile: 'game',
      measureFrames: 2,
    })
    const sample = await doctor.measure()
    expect(sample.invalid).toBe(true)
    const report = await doctor.diagnose()
    expect(report.invalid).toBe(true)
    expect(report.incomplete).toBe(true)
  })

  it('does not treat a synthetic now() clock as a hidden-tab failure', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: rendererStub() as never,
      profile: 'game',
      measureFrames: 2,
      now: clock(),
    })
    const sample = await doctor.measure()
    expect(sample.invalid).toBeUndefined()
  })

  it('marks throttled waitFrame gaps invalid', async () => {
    let n = 0
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: rendererStub() as never,
      profile: 'game',
      measureFrames: 4,
      now: () => n,
      waitFrame: async () => {
        n += n > 20 ? 1000 : 16
      },
    })
    const sample = await doctor.measure()
    expect(sample.invalid).toBe(true)
    expect(String(sample.invalidReason)).toMatch(/throttl/i)
  })
})

describe('P3: stable A/B helper', () => {
  it('interleaves A/B rounds with a fixed pose and refuses a win inside noise', async () => {
    const camera = { position: { x: 0, y: 0, z: 0 } }
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera,
      renderer: rendererStub() as never,
      profile: 'game',
      measureFrames: 2,
      now: clock(),
    })
    const poses = [{ x: 1, y: 2, z: 3 }]
    const compared = await doctor.compareAb({
      rounds: 2,
      poses,
      applyB: async () => {},
    })
    expect(camera.position).toEqual({ x: 1, y: 2, z: 3 })
    expect(compared.claimed.triangles).toBe('inside-noise')
    expect(compared.noiseBand.triangles).toBeDefined()
    expect(compared.invalid).toBeFalsy()
  })
})

describe('P3: pixel-diff visual gate is opt-in', () => {
  it('sets visualDelta and does not treat the run as visually safe', async () => {
    const baseline = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255])
    const afterPix = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255])
    let captures = 0
    const doctor = new Doctor({
      scene: { children: [], traverse() {} } as never,
      camera: {},
      renderer: rendererStub() as never,
      profile: 'game',
      measureFrames: 1,
      now: clock(),
    })
    const report = await doctor.optimize({
      apply: ['safe'],
      visualGate: {
        capture() {
          captures += 1
          return captures <= 2 ? baseline : afterPix
        },
        maxChangedRatio: 0.05,
      },
    })
    expect(captures).toBeGreaterThanOrEqual(4)
    expect(report.visualDelta).toBe(true)
    expect(report.appliedPasses.length).toBeGreaterThan(0)
    expect(
      classifyVisualSafety({
        controlChangedRatio: pixelChangedRatio(baseline, baseline),
        candidateChangedRatio: pixelChangedRatio(baseline, afterPix),
        maxChangedRatio: 0.05,
      }).safe,
    ).toBe(false)
  })

  it('rolls back applied passes after a reproduced visual difference', async () => {
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
    expect(captures).toBeGreaterThanOrEqual(4)
    expect(report.visualDelta).toBe(true)
    expect(renderer.pixelRatio).toBe(3)
  })

  it('does not treat a one-off capture as visualDelta without a confirming second capture', async () => {
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
          if (captures <= 2) return baseline
          if (captures === 3) return afterPix
          return baseline
        },
        maxChangedRatio: 0.05,
      },
    })
    expect(captures).toBeGreaterThanOrEqual(4)
    expect(report.visualDelta).toBeUndefined()
    expect(renderer.pixelRatio).toBeLessThan(3)
  })
})

describe('P3: compareAbSamples is the public math hosts should use', () => {
  it('is exported for harnesses that already have samples', () => {
    expect(typeof compareAbSamples).toBe('function')
  })
})
