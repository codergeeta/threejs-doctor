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

  it('reclamps DPR if the host raises it above the safe-auto ceiling', async () => {
    const { doctor, renderer } = createLadderDoctor({ measureFrames: 4 })
    const ladder = new QualityController(doctor, {
      startTier: 'potato',
      maxTier: 'mid',
      windowFrames: 4,
      waitForFirstInteractive: async () => {},
    })
    await ladder.boot()
    renderer.pixelRatio = 3
    await ladder.runLadder()
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.0)
  })
})
