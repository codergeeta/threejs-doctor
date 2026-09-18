import { describe, it, expect } from 'vitest'
import { claimAbDelta, compareAbSamples, type MetricsSample } from '../index.js'

function sample(partial: Partial<MetricsSample>): MetricsSample {
  return {
    avgFps: 60,
    p95FrameTimeMs: 16,
    drawCalls: 40,
    triangles: 10_000,
    textureCount: 4,
    geometryCount: 4,
    lightCount: 1,
    shadowCastingLightCount: 0,
    ...partial,
  }
}

describe('claimAbDelta', () => {
  it('never claims a win inside the noise band', () => {
    expect(claimAbDelta(100, 98, { abs: 5, rel: 0.05 }, 'lower-better')).toBe('inside-noise')
    expect(claimAbDelta(100, 99, { abs: 0, rel: 0.02 }, 'lower-better')).toBe('inside-noise')
  })

  it('claims a win when the improvement exceeds the band', () => {
    expect(claimAbDelta(100_000, 21_000, { abs: 2_000, rel: 0.02 }, 'lower-better')).toBe('win')
    expect(claimAbDelta(30, 48, { abs: 2, rel: 0.05 }, 'higher-better')).toBe('win')
  })

  it('claims a loss when the regression exceeds the band', () => {
    expect(claimAbDelta(16, 40, { abs: 1, rel: 0.02 }, 'lower-better')).toBe('loss')
  })
})

describe('compareAbSamples', () => {
  it('uses control-round variance as the noise band and does not claim a 2% wiggle as a win', () => {
    const a = [sample({ triangles: 10_000 }), sample({ triangles: 10_200 }), sample({ triangles: 9_900 })]
    const b = [sample({ triangles: 9_850 }), sample({ triangles: 10_050 }), sample({ triangles: 9_950 })]
    const result = compareAbSamples({ a, b })
    expect(result.claimed.triangles).toBe('inside-noise')
    expect(result.noiseBand.triangles?.rel).toBeGreaterThan(0)
  })

  it('claims a triangle win when B is far outside A variance', () => {
    const a = [sample({ triangles: 100_000 }), sample({ triangles: 102_000 })]
    const b = [sample({ triangles: 21_000 }), sample({ triangles: 20_500 })]
    const result = compareAbSamples({ a, b })
    expect(result.claimed.triangles).toBe('win')
    expect(result.before.triangles).toBeCloseTo(101_000, -2)
    expect(result.after.triangles).toBeCloseTo(20_750, -2)
  })

  it('omits gpuFrameTimeMs claims when GPU times were not measured', () => {
    const result = compareAbSamples({
      a: [sample({})],
      b: [sample({ triangles: 1_000 })],
    })
    expect(result.claimed.gpuFrameTimeMs).toBeUndefined()
    expect(result.after.gpuFrameTimeMs).toBeUndefined()
  })
})
