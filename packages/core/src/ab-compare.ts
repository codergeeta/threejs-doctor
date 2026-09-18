import type { MetricsSample } from './types.js'
import { median } from './stats-math.js'

export type AbDirection = 'lower-better' | 'higher-better'
export type AbClaim = 'win' | 'loss' | 'inside-noise'

export interface NoiseBand {
  abs: number
  rel: number
}

const LOWER_BETTER: Array<keyof MetricsSample> = [
  'p95FrameTimeMs',
  'drawCalls',
  'triangles',
  'textureCount',
  'estimatedVramBytes',
  'geometryCount',
  'lightCount',
  'shadowCastingLightCount',
  'gpuFrameTimeMs',
  'drawingBufferPixels',
]

const HIGHER_BETTER: Array<keyof MetricsSample> = ['avgFps']

export function claimAbDelta(
  before: number,
  after: number,
  band: NoiseBand,
  direction: AbDirection,
): AbClaim {
  const threshold = Math.max(band.abs, Math.abs(before) * band.rel)
  const delta = after - before
  if (Math.abs(delta) <= threshold) return 'inside-noise'
  if (direction === 'lower-better') return delta < 0 ? 'win' : 'loss'
  return delta > 0 ? 'win' : 'loss'
}

function noiseFromControl(values: number[]): NoiseBand {
  const mid = median(values)
  const halfRange = (Math.max(...values) - Math.min(...values)) / 2
  const abs = Math.max(halfRange, 0)
  const rel = Math.abs(mid) > 0 ? abs / Math.abs(mid) : 0
  return { abs, rel }
}

function numericSeries(samples: MetricsSample[], key: keyof MetricsSample): number[] | undefined {
  const values: number[] = []
  for (const sample of samples) {
    const value = sample[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
    values.push(value)
  }
  return values.length > 0 ? values : undefined
}

function averageSample(samples: MetricsSample[]): MetricsSample {
  const keys = Object.keys(samples[0]!) as Array<keyof MetricsSample>
  const out = { ...samples[0]! }
  for (const key of keys) {
    const series = numericSeries(samples, key)
    if (!series) {
      delete (out as Record<string, unknown>)[key]
      continue
    }
    ;(out as Record<string, unknown>)[key] = median(series)
  }
  return out
}

export interface AbCompareInput {
  a: MetricsSample[]
  b: MetricsSample[]
}

export interface AbCompareResult {
  before: MetricsSample
  after: MetricsSample
  deltas: Partial<Record<keyof MetricsSample, number>>
  noiseBand: Partial<Record<keyof MetricsSample, NoiseBand>>
  claimed: Partial<Record<keyof MetricsSample, AbClaim>>
  invalid?: boolean
  invalidReason?: string
}

export function compareAbSamples(input: AbCompareInput): AbCompareResult {
  const before = averageSample(input.a)
  const after = averageSample(input.b)
  const deltas: Partial<Record<keyof MetricsSample, number>> = {}
  const noiseBand: Partial<Record<keyof MetricsSample, NoiseBand>> = {}
  const claimed: Partial<Record<keyof MetricsSample, AbClaim>> = {}
  const keys = new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ]) as Set<keyof MetricsSample>

  for (const key of keys) {
    const aSeries = numericSeries(input.a, key)
    const bSeries = numericSeries(input.b, key)
    const bVal = after[key]
    const aVal = before[key]
    if (typeof aVal !== 'number' || typeof bVal !== 'number' || !aSeries || !bSeries) continue
    deltas[key] = bVal - aVal
    const band = noiseFromControl(aSeries)
    noiseBand[key] = band
    const direction: AbDirection = HIGHER_BETTER.includes(key) ? 'higher-better' : 'lower-better'
    if (!LOWER_BETTER.includes(key) && !HIGHER_BETTER.includes(key)) continue
    claimed[key] = claimAbDelta(aVal, bVal, band, direction)
  }

  const result: AbCompareResult = { before, after, deltas, noiseBand, claimed }
  const invalidSample = input.a.find((s) => s.invalid) ?? input.b.find((s) => s.invalid)
  if (invalidSample) {
    result.invalid = true
    if (invalidSample.invalidReason) result.invalidReason = invalidSample.invalidReason
  }
  return result
}
