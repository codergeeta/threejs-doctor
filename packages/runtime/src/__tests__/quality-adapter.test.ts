import { describe, it, expect } from 'vitest'
import { QualityController } from '../quality-controller.js'
import { createLadderDoctor } from './ladder-harness.js'
import type { QualityAdapter, QualityKnobSet, QualityTier } from '@threejs-doctor/core'

describe('QualityController adapter wiring', () => {
  it('passes only advertised knobs and records unsupportedKnob for unknown keys on the adapter side', async () => {
    const seen: QualityKnobSet[] = []
    const adapter: QualityAdapter = {
      id: 'partial',
      capabilities: () => ['rtScale', 'deferredHdr'],
      snapshot: () => ({ rtScale: 1, deferredHdr: false }),
      apply(_tier: QualityTier, knobs: QualityKnobSet) {
        seen.push(knobs)
        return { rollback() {} }
      },
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(seen).toHaveLength(1)
    expect(seen[0]!.rtScale).toBe(0.35)
    expect(seen[0]!.deferredHdr).toBe(true)
    expect(seen[0]!.fftSize).toBeUndefined()
    expect(seen[0]!.meshLod).toBeUndefined()
    expect(boot.appliedKnobs.map((k) => k.capability).sort()).toEqual([
      'deferredHdr',
      'rtScale',
    ])
    expect(boot.unsupportedKnobs.sort()).toEqual(['fftSize', 'meshLod'])
  })

  it('records unsupportedKnobs when apply is given a capability the adapter does not implement', async () => {
    const adapter: QualityAdapter = {
      id: 'rt-only',
      capabilities: () => ['rtScale'],
      snapshot: () => ({}),
      apply(_tier, knobs) {
        if (knobs.fftSize) {
          // controller must not do this; test the controller filter, not the adapter
        }
        return { rollback() {} }
      },
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(boot.unsupportedKnobs).not.toContain('rtScale')
    expect(boot.unsupportedKnobs).toContain('fftSize')
    expect(boot.unsupportedKnobs).toContain('meshLod')
    expect(boot.unsupportedKnobs).toContain('deferredHdr')
    expect(boot.appliedKnobs.some((k) => k.capability === 'fftSize')).toBe(false)
  })

  it('advise never calls adapter.apply', async () => {
    let applies = 0
    const adapter: QualityAdapter = {
      id: 'x',
      capabilities: () => ['fftSize'],
      snapshot: () => ({ fftSize: [128, 256, 128] }),
      apply() {
        applies += 1
        return { rollback() {} }
      },
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'advise' })
    ladder.registerAdapter(adapter)
    await ladder.boot()
    expect(applies).toBe(0)
  })

  it('copies simPassCount from readExtras and never defaults it to 53', async () => {
    const adapter: QualityAdapter = {
      id: 'silent-sim',
      capabilities: () => ['simPassCount'],
      snapshot: () => ({}),
      apply: () => ({ rollback() {} }),
      readExtras: () => ({}),
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(boot.baseline.simPassCount).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(boot.baseline, 'simPassCount')).toBe(false)
    expect(JSON.stringify(boot)).not.toMatch(/"simPassCount":\s*53/)
  })

  it('passthrough extras when readExtras returns simPassCount', async () => {
    const adapter: QualityAdapter = {
      id: 'counted',
      capabilities: () => ['simPassCount'],
      snapshot: () => ({}),
      apply: () => ({ rollback() {} }),
      readExtras: () => ({ simPassCount: 17 }),
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(boot.baseline.simPassCount).toBe(17)
    expect(boot.findings.some((f) => f.id === 'quality/heavy-sim-passes')).toBe(true)
  })

  it('takeover calls takeExclusiveControl and dispose releases it after knob rollback', async () => {
    const order: string[] = []
    const adapter: QualityAdapter = {
      id: 'ex',
      capabilities: () => ['rtScale'],
      snapshot: () => ({}),
      apply() {
        order.push('apply')
        return {
          rollback() {
            order.push('knob-rollback')
          },
        }
      },
      takeExclusiveControl() {
        order.push('take')
        return {
          release() {
            order.push('release')
          },
        }
      },
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'takeover' })
    ladder.registerAdapter(adapter)
    await ladder.boot()
    expect(order).toEqual(['take', 'apply'])
    ladder.dispose()
    expect(order).toEqual(['take', 'apply', 'knob-rollback', 'release'])
  })

  it('rolls back a throwing adapter apply, continues, and sets applyFailed', async () => {
    const adapter: QualityAdapter = {
      id: 'boom',
      capabilities: () => ['fftSize', 'rtScale'],
      snapshot: () => ({}),
      apply(_tier, knobs) {
        if (knobs.fftSize) throw new Error('cannot rebuild cascade')
        return { rollback() {} }
      },
    }
    const { doctor, renderer } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(boot.applyFailed).toBe(true)
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.0)
    expect(boot.appliedKnobs.some((k) => k.capability === 'fftSize')).toBe(false)
  })

  it('continues boot when takeExclusiveControl throws', async () => {
    const adapter: QualityAdapter = {
      id: 'ex-boom',
      capabilities: () => ['rtScale'],
      snapshot: () => ({}),
      apply() {
        return { rollback() {} }
      },
      takeExclusiveControl() {
        throw new Error('cannot pause host')
      },
    }
    const { doctor, renderer } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'takeover' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(boot.applyFailed).toBe(true)
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.0)
    expect(boot.appliedKnobs.some((k) => k.capability === 'rtScale')).toBe(true)
    expect(() => ladder.dispose()).not.toThrow()
  })

  it('treats throwing capabilities() as adapterUnavailable and still applies generic caps', async () => {
    const adapter: QualityAdapter = {
      id: 'caps-boom',
      capabilities() {
        throw new Error('no handle')
      },
      snapshot: () => ({}),
      apply() {
        throw new Error('should not apply')
      },
    }
    const { doctor, renderer } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(boot.adapterUnavailable).toBe(true)
    expect(boot.appliedPasses.length).toBeGreaterThan(0)
    expect(renderer.pixelRatio).toBeLessThanOrEqual(1.0)
  })

  it('omits extras and still returns a report when readExtras throws', async () => {
    const adapter: QualityAdapter = {
      id: 'extras-boom',
      capabilities: () => ['rtScale'],
      snapshot: () => ({}),
      apply: () => ({ rollback() {} }),
      readExtras() {
        throw new Error('no extras')
      },
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(boot.appliedKnobs.some((k) => k.capability === 'rtScale')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(boot.baseline, 'simPassCount')).toBe(false)
    expect(boot.findings.some((f) => f.id === 'quality/heavy-sim-passes')).toBe(false)
  })

  it('sets adapterUnavailable when capabilities are empty', async () => {
    const adapter: QualityAdapter = {
      id: 'gone',
      capabilities: () => [],
      snapshot: () => ({}),
      apply() {
        throw new Error('should not apply')
      },
    }
    const { doctor } = createLadderDoctor()
    const ladder = new QualityController(doctor, { mode: 'safe-auto' })
    ladder.registerAdapter(adapter)
    const boot = await ladder.boot()
    expect(boot.adapterUnavailable).toBe(true)
    expect(boot.appliedPasses.length).toBeGreaterThan(0)
  })
})
