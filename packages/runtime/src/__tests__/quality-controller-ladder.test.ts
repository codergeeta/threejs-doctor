import { describe, it, expect } from 'vitest'
import { QualityController } from '../quality-controller.js'
import { createLadderDoctor } from './ladder-harness.js'
import { HYSTERESIS } from '@threejs-doctor/core'
import type { QualityAdapter, QualityTier } from '@threejs-doctor/core'

function adapterRecording(applies: QualityTier[]): QualityAdapter {
  return {
    id: 'rec',
    capabilities: () => ['rtScale'],
    snapshot: () => ({}),
    apply(tier) {
      applies.push(tier)
      return { rollback() {} }
    },
  }
}

describe('QualityController.runLadder', () => {
  it('calls boot() first when boot was not invoked', async () => {
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, {
      waitForFirstInteractive: async () => {},
      windowFrames: 4,
    })
    const settled = await ladder.runLadder()
    expect(settled.startTier).toBe('potato')
    expect(settled.phase).toBe('runtime')
  })

  it('drops one tier when two windows miss 30 FPS and does not jump two rungs', async () => {
    const applies: QualityTier[] = []
    let calls = 0
    const { doctor } = createLadderDoctor({
      now: (() => {
        let t = 0
        return () => {
          calls += 1
          // first boot frames 16ms; subsequent measure windows 40ms
          t += calls < 20 ? 16 : 40
          return t
        }
      })(),
      measureFrames: 4,
      device: {
        tier: 'mid',
        maxTextureSize: 8192,
        webgl: true,
        webgpu: false,
        devicePixelRatio: 2,
        hardwareConcurrency: 8,
      },
    })
    const ladder = new QualityController(doctor, {
      mode: 'safe-auto',
      startTier: 'mid',
      maxTier: 'high',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    ladder.registerAdapter(adapterRecording(applies))
    await ladder.boot()
    const settled = await ladder.runLadder()
    expect(settled.tier === 'low' || settled.tier === 'potato').toBe(true)
    expect(settled.tier).not.toBe('high')
    const uniqueJumps = applies.filter((t, i) => i === 0 || t !== applies[i - 1])
    for (let i = 1; i < uniqueJumps.length; i++) {
      const order = ['potato', 'low', 'mid', 'high']
      expect(Math.abs(order.indexOf(uniqueJumps[i]!) - order.indexOf(uniqueJumps[i - 1]!))).toBeLessThanOrEqual(1)
    }
  })

  it('climbs one rung after 3 fast runtime windows and does not skip a tier', async () => {
    const applies: QualityTier[] = []
    const { doctor } = createLadderDoctor({
      now: (() => {
        let t = 0
        return () => {
          t += 16
          return t
        }
      })(),
      measureFrames: 4,
    })
    const ladder = new QualityController(doctor, {
      mode: 'safe-auto',
      startTier: 'potato',
      maxTier: 'mid',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    ladder.registerAdapter(adapterRecording(applies))
    await ladder.boot()
    const settled = await ladder.runLadder()
    expect(settled.tier).not.toBe('potato')
    expect(['low', 'mid']).toContain(settled.tier)
    const uniqueJumps = applies.filter((t, i) => i === 0 || t !== applies[i - 1])
    expect(uniqueJumps[0]).toBe('potato')
    expect(uniqueJumps).toContain('low')
    for (let i = 1; i < uniqueJumps.length; i++) {
      const order = ['potato', 'low', 'mid', 'high']
      expect(
        Math.abs(order.indexOf(uniqueJumps[i]!) - order.indexOf(uniqueJumps[i - 1]!)),
      ).toBe(1)
    }
  })

  it('does not climb when still in boot phase windows', async () => {
    const { doctor } = createLadderDoctor({
      now: (() => {
        let t = 0
        return () => {
          t += 16
          return t
        }
      })(),
      measureFrames: 4,
    })
    const ladder = new QualityController(doctor, {
      startTier: 'potato',
      maxTier: 'mid',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    const boot = await ladder.boot()
    expect(boot.tier).toBe('potato')
    const settled = await ladder.runLadder()
    // 16ms frames can climb after boot; assert the boot report itself did not climb
    expect(boot.tier).toBe(boot.startTier)
    expect(settled.phase).toBe('runtime')
  })

  it('sets floorFailed when potato still misses target', async () => {
    const { doctor } = createLadderDoctor({
      now: (() => {
        let t = 0
        return () => {
          t += 50
          return t
        }
      })(),
      measureFrames: 4,
    })
    const ladder = new QualityController(doctor, {
      startTier: 'potato',
      maxTier: 'mid',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    const settled = await ladder.runLadder()
    expect(settled.tier).toBe('potato')
    expect(settled.floorFailed).toBe(true)
  })

  it('advise evaluates recommendations without applying adapter or changing DPR', async () => {
    const applies: QualityTier[] = []
    const { doctor, renderer } = createLadderDoctor({
      now: (() => {
        let t = 0
        return () => {
          t += 50
          return t
        }
      })(),
      measureFrames: 4,
    })
    const dprBefore = renderer.pixelRatio
    const ladder = new QualityController(doctor, {
      mode: 'advise',
      startTier: 'mid',
      maxTier: 'high',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    ladder.registerAdapter(adapterRecording(applies))
    const settled = await ladder.runLadder()
    expect(applies).toEqual([])
    expect(renderer.pixelRatio).toBe(dprBefore)
    expect(settled.recommendedTier).toBeDefined()
  })

  it('marks incomplete and keeps baseline when after-measure throws', async () => {
    let samples = 0
    const { doctor } = createLadderDoctor({
      measureFrames: 4,
      getSceneStats: () => {
        samples += 1
        if (samples > 3) throw new Error('gpu lost')
        return {
          textureCount: 4,
          estimatedVramBytes: 8_000_000,
          geometryCount: 8,
          lightCount: 2,
          shadowCastingLightCount: 2,
        }
      },
    })
    const ladder = new QualityController(doctor, {
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    const settled = await ladder.runLadder()
    expect(settled.incomplete).toBe(true)
    expect(settled.after).toBeUndefined()
    expect(settled.deltas).toBeUndefined()
    expect(settled.baseline).toBeDefined()
  })

  it('does not permanently block climb after a one-shot applyFailed', async () => {
    let applies = 0
    const adapter: QualityAdapter = {
      id: 'once-boom',
      capabilities: () => ['rtScale'],
      snapshot: () => ({}),
      apply() {
        applies += 1
        if (applies === 1) throw new Error('first apply failed')
        return { rollback() {} }
      },
    }
    const { doctor } = createLadderDoctor({
      now: (() => {
        let t = 0
        return () => {
          t += 16
          return t
        }
      })(),
      measureFrames: 4,
    })
    const ladder = new QualityController(doctor, {
      mode: 'safe-auto',
      startTier: 'potato',
      maxTier: 'mid',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(boot.applyFailed).toBe(true)
    const settled = await ladder.runLadder()
    expect(settled.applyFailed).toBe(true)
    expect(settled.tier).not.toBe('potato')
  })

  it('drops after a failed apply when the next window is still below 30 FPS', async () => {
    const applies: QualityTier[] = []
    const adapter: QualityAdapter = {
      id: 'boom-mid',
      capabilities: () => ['rtScale'],
      snapshot: () => ({}),
      apply(tier) {
        applies.push(tier)
        if (applies.length === 1) throw new Error('cannot apply mid knobs')
        return { rollback() {} }
      },
    }
    let calls = 0
    const { doctor } = createLadderDoctor({
      now: (() => {
        let t = 0
        return () => {
          calls += 1
          // boot measure (4 frames × 2 now) at 16ms; first ladder window at 40ms; rest fast
          t += calls <= 8 ? 16 : calls <= 16 ? 40 : 16
          return t
        }
      })(),
      measureFrames: 4,
      device: {
        tier: 'mid',
        maxTextureSize: 8192,
        webgl: true,
        webgpu: false,
        devicePixelRatio: 2,
        hardwareConcurrency: 8,
      },
    })
    const ladder = new QualityController(doctor, {
      mode: 'safe-auto',
      startTier: 'mid',
      maxTier: 'high',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    ladder.registerAdapter(adapter)
    await ladder.boot()
    const settled = await ladder.runLadder()
    expect(settled.applyFailed).toBe(true)
    expect(applies).toContain('low')
    expect(settled.tier).not.toBe('mid')
  })

  it('emergency-drops through the controller on a single ≥50ms window', async () => {
    const applies: QualityTier[] = []
    let calls = 0
    const { doctor } = createLadderDoctor({
      now: (() => {
        let t = 0
        return () => {
          calls += 1
          t += calls <= 8 ? 16 : calls <= 16 ? 50 : 16
          return t
        }
      })(),
      measureFrames: 4,
      device: {
        tier: 'mid',
        maxTextureSize: 8192,
        webgl: true,
        webgpu: false,
        devicePixelRatio: 2,
        hardwareConcurrency: 8,
      },
    })
    const ladder = new QualityController(doctor, {
      mode: 'safe-auto',
      startTier: 'mid',
      maxTier: 'high',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    ladder.registerAdapter(adapterRecording(applies))
    await ladder.boot()
    const settled = await ladder.runLadder()
    expect(applies[0]).toBe('mid')
    expect(applies).toContain('low')
    expect(applies.indexOf('low')).toBeGreaterThan(0)
    expect(settled.tier).toBeDefined()
  })

  it('blocks climb during cooldown windows after an emergency drop', async () => {
    const applies: QualityTier[] = []
    const applyAtCalls: number[] = []
    let calls = 0
    const { doctor } = createLadderDoctor({
      now: (() => {
        let t = 0
        return () => {
          calls += 1
          t += calls <= 8 ? 16 : calls <= 16 ? 50 : 16
          return t
        }
      })(),
      measureFrames: 4,
    })
    const ladder = new QualityController(doctor, {
      mode: 'safe-auto',
      startTier: 'low',
      maxTier: 'low',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    ladder.registerAdapter({
      id: 'rec',
      capabilities: () => ['rtScale'],
      snapshot: () => ({}),
      apply(tier) {
        applies.push(tier)
        applyAtCalls.push(calls)
        return { rollback() {} }
      },
    })
    await ladder.boot()
    await ladder.runLadder()
    expect(applies[0]).toBe('low')
    expect(applies[1]).toBe('potato')
    const climbBack = applies.findIndex((t, i) => i > 1 && t === 'low')
    expect(climbBack).toBeGreaterThan(1)
    // 4-frame windows use 8 now() ticks. Cooldown is 2 windows, then 3 fast to climb.
    const ticksBetween = applyAtCalls[climbBack]! - applyAtCalls[1]!
    expect(ticksBetween).toBeGreaterThanOrEqual(8 * 4)
  })

  it('emergency-drops startTier low to potato on waitFrame windows with p95 ≥ 50ms', async () => {
    const applies: QualityTier[] = []
    let t = 0
    const { doctor } = createLadderDoctor({
      now: () => t,
      waitFrame: async () => {
        t += 60
      },
      measureFrames: 4,
    })
    const ladder = new QualityController(doctor, {
      mode: 'safe-auto',
      startTier: 'low',
      maxTier: 'high',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    ladder.registerAdapter(adapterRecording(applies))
    await ladder.boot()
    const settled = await ladder.runLadder()
    expect(applies[0]).toBe('low')
    expect(applies).toContain('potato')
    expect(settled.tier).toBe('potato')
    expect(settled.startTier).toBe('low')
  })

  it('drops startTier low to potato after two waitFrame windows below 30 FPS', async () => {
    const applies: QualityTier[] = []
    let t = 0
    const { doctor } = createLadderDoctor({
      now: () => t,
      waitFrame: async () => {
        t += 40
      },
      measureFrames: 4,
    })
    const ladder = new QualityController(doctor, {
      mode: 'safe-auto',
      startTier: 'low',
      maxTier: 'high',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    ladder.registerAdapter(adapterRecording(applies))
    await ladder.boot()
    const settled = await ladder.runLadder()
    expect(applies[0]).toBe('low')
    expect(applies).toContain('potato')
    expect(settled.tier).toBe('potato')
  })

  it('emergency-drops from boot p95 when the first runtime waitFrame measure throws', async () => {
    const applies: QualityTier[] = []
    let t = 0
    let frames = 0
    const measureFrames = 4
    const { doctor } = createLadderDoctor({
      now: () => t,
      waitFrame: async () => {
        frames += 1
        if (frames <= measureFrames) {
          t += 80
          return
        }
        throw new TypeError("Cannot read properties of null (reading 'pack')")
      },
      measureFrames,
    })
    doctor.mountOverlay()
    const ladder = new QualityController(doctor, {
      mode: 'safe-auto',
      startTier: 'low',
      maxTier: 'high',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    ladder.registerAdapter(adapterRecording(applies))
    const boot = await ladder.boot()
    expect(boot.tier).toBe('low')
    expect(boot.baseline.p95FrameTimeMs).toBeGreaterThanOrEqual(HYSTERESIS.emergencyP95Ms)
    const settled = await ladder.runLadder()
    expect(settled.tier).toBe('potato')
    expect(applies).toContain('potato')
    expect(settled.incomplete).toBe(true)
    expect(settled.after).toBeUndefined()
    expect(settled.baseline.p95FrameTimeMs).toBeGreaterThanOrEqual(HYSTERESIS.emergencyP95Ms)
    expect(document.getElementById('threejs-doctor-overlay')?.textContent).toMatch(/low→potato/)
    doctor.unmountOverlay()
  })

  it('does not climb on 0ms waitFrame samples and still emergency-drops a later slow window', async () => {
    const applies: QualityTier[] = []
    let t = 0
    let frames = 0
    const { doctor } = createLadderDoctor({
      now: () => t,
      waitFrame: async () => {
        frames += 1
        if (frames <= 4) t += 16
        else if (frames <= 16) t += 0
        else t += 80
      },
      measureFrames: 4,
    })
    const ladder = new QualityController(doctor, {
      mode: 'safe-auto',
      startTier: 'low',
      maxTier: 'high',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    ladder.registerAdapter(adapterRecording(applies))
    await ladder.boot()
    const settled = await ladder.runLadder()
    expect(applies.filter((tier) => tier === 'mid' || tier === 'high')).toEqual([])
    expect(applies).toContain('potato')
    expect(settled.tier).toBe('potato')
  })

  it('reclamps DPR if the host raises it above the safe-auto ceiling', async () => {
    const { doctor, renderer } = createLadderDoctor({ measureFrames: 4 })
    const ladder = new QualityController(doctor, {
      startTier: 'potato',
      maxTier: 'potato',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    await ladder.boot()
    renderer.pixelRatio = 3
    await ladder.runLadder()
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.0)
  })
})
