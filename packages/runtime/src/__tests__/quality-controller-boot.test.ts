import { describe, it, expect } from 'vitest'
import { QualityController } from '../quality-controller.js'
import { createLadderDoctor } from './ladder-harness.js'
import { dprCapPass } from '../passes/dpr-cap.js'
import type { QualityAdapter } from '@threejs-doctor/core'

function fakeAdapter(applyCalls: unknown[]): QualityAdapter {
  return {
    id: 'fake',
    capabilities: () => ['fftSize'],
    snapshot: () => ({}),
    apply(tier, knobs) {
      applyCalls.push({ tier, knobs })
      return { rollback() {} }
    },
  }
}

describe('QualityController.boot', () => {
  it('defaults mode to safe-auto when omitted', async () => {
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor)
    const boot = await ladder.boot()
    expect(boot.qualityMode).toBe('safe-auto')
  })

  it('records ttfiMs from a fake waitForFirstInteractive clock', async () => {
    let t = 1000
    const { doctor } = createLadderDoctor({ now: () => t })
    const ladder = new QualityController(doctor, {
      now: () => t,
      waitForFirstInteractive: async () => {
        t = 2840
      },
    })
    const boot = await ladder.boot()
    expect(boot.ttfiMs).toBe(1840)
    expect(boot.phase).toBe('runtime')
    expect(boot.incomplete).toBe(false)
  })

  it('omits ttfiMs and sets incomplete when waitForFirstInteractive throws', async () => {
    let t = 0
    const { doctor } = createLadderDoctor({ now: () => t })
    const ladder = new QualityController(doctor, {
      now: () => t,
      waitForFirstInteractive: async () => {
        throw new Error('no first frame')
      },
    })
    const boot = await ladder.boot()
    expect(boot.incomplete).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(boot, 'ttfiMs')).toBe(false)
  })

  it('safe-auto applies start-tier generic caps before first interactive and does not call Doctor.optimize', async () => {
    const { doctor, renderer } = createLadderDoctor()
    let optimized = false
    const original = doctor.optimize.bind(doctor)
    doctor.optimize = async (...args) => {
      optimized = true
      return original(...args)
    }
    const applyCalls: unknown[] = []
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(fakeAdapter(applyCalls))
    const boot = await ladder.boot()
    expect(optimized).toBe(false)
    expect(boot.startTier).toBe('potato')
    expect(boot.tier).toBe('potato')
    expect(boot.maxTier).toBe('mid')
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.0)
    expect(boot.appliedPasses).toContain('dpr-cap')
  })

  it('advise never mutates renderer or calls adapter.apply', async () => {
    const { doctor, renderer } = createLadderDoctor()
    const applyCalls: unknown[] = []
    const ladder = new QualityController(doctor, { mode: 'advise' })
    ladder.registerAdapter(fakeAdapter(applyCalls))
    const boot = await ladder.boot()
    expect(renderer.pixelRatio).toBe(3)
    expect(applyCalls).toEqual([])
    expect(boot.appliedPasses).toEqual([])
    expect(boot.qualityMode).toBe('advise')
    expect(boot.recommendedTier).toBe('potato')
  })

  it('does not climb during boot', async () => {
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    const boot = await ladder.boot()
    expect(boot.phase).toBe('runtime')
    expect(boot.tier).toBe(boot.startTier)
  })

  it('adds quality/no-float-rt when probe says noFloatRt', async () => {
    const { doctor } = createLadderDoctor({
      device: {
        tier: 'high',
        maxTextureSize: 16384,
        webgl: true,
        webgpu: true,
        devicePixelRatio: 1,
        hardwareConcurrency: 16,
        colorBufferFloat: false,
      },
    })
    const ladder = new QualityController(doctor, { mode: 'advise' })
    const boot = await ladder.boot()
    expect(boot.tier).toBe('potato')
    expect(boot.maxTier).toBe('potato')
    expect(boot.findings.some((f) => f.id === 'quality/no-float-rt')).toBe(true)
  })

  it('v1 dpr-cap without qualityTier still caps low devices to 1.5', () => {
    const renderer = {
      pixelRatio: 3,
      setPixelRatio(v: number) {
        this.pixelRatio = v
      },
    }
    dprCapPass.apply({
      renderer: renderer as never,
      scene: { children: [], traverse() {} } as never,
      device: {
        tier: 'low',
        maxTextureSize: 4096,
        webgl: true,
        webgpu: false,
        devicePixelRatio: 3,
        hardwareConcurrency: 4,
      },
      profile: 'marketing',
      postfxEnabled: true,
      frameloop: 'always',
      setFrameloop() {},
    })
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.5)
    expect(renderer.pixelRatio).toBeGreaterThan(1.0)
  })
})
