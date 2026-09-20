import { claimAbDelta, type AbClaim, type NoiseBand } from '@threejs-doctor/core'
import { metricShortLabel } from './metric-labels.js'

export type BadgeState =
  | 'win'
  | 'loss'
  | 'inside-noise'
  | 'unchanged'
  | 'not-measured'
  | 'expected-trade-off'

export type JsonMap = Record<string, unknown>
export type ReportJson = JsonMap

export const INTEGER_METRICS = new Set([
  'drawCalls',
  'triangles',
  'lightCount',
  'shadowCastingLightCount',
  'drawingBufferPixels',
  'textureCount',
  'geometryCount',
  'simPassCount',
  'bytesLoaded',
  'estimatedVramBytes',
])

/** Performance cost. Lower is better except `avgFps`. */
export const COST_METRICS = [
  'gpuFrameTimeMs',
  'p95FrameTimeMs',
  'avgFps',
  'triangles',
  'drawCalls',
  'drawingBufferPixels',
] as const

/** Scene composition counts — not scored as regressions when unchanged. */
export const SCENE_FACT_METRICS = ['lightCount', 'shadowCastingLightCount'] as const

const PERCENT_METRICS = new Set([
  'gpuFrameTimeMs',
  'p95FrameTimeMs',
  'avgFps',
  'triangles',
  'drawingBufferPixels',
])

/** Wins on these metrics get an "(outside noise)" qualifier in the strip. */
const NOISY_METRICS = new Set(['gpuFrameTimeMs', 'p95FrameTimeMs', 'avgFps'])

export const BADGE_LABEL: Record<BadgeState, string> = {
  win: 'win',
  loss: 'loss',
  'inside-noise': 'inside-noise',
  unchanged: 'unchanged',
  'not-measured': 'not measured',
  'expected-trade-off': 'expected trade-off',
}

export function isRecord(value: unknown): value is JsonMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function expectedTradeoffSet(input: JsonMap): Set<string> {
  const raw = input.expectedTradeoffs
  if (!Array.isArray(raw)) return new Set()
  return new Set(raw.filter((item): item is string => typeof item === 'string' && item.length > 0))
}

function noiseBandOf(input: JsonMap, key: string): NoiseBand | undefined {
  const bands = input.noiseBand
  if (!isRecord(bands)) return undefined
  const band = bands[key]
  if (!isRecord(band)) return undefined
  const abs = asNumber(band.abs)
  const rel = asNumber(band.rel)
  if (abs === undefined || rel === undefined) return undefined
  return { abs, rel }
}

function claimedOf(input: JsonMap, key: string): AbClaim | undefined {
  const claimed = input.claimed
  if (!isRecord(claimed)) return undefined
  const value = claimed[key]
  if (value === 'win' || value === 'loss' || value === 'inside-noise') return value
  return undefined
}

export function badgeForMetric(input: JsonMap, key: string): BadgeState | undefined {
  const baseline = isRecord(input.baseline) ? input.baseline : undefined
  if (!baseline) return undefined
  const beforeVal = asNumber(baseline[key])
  if (beforeVal === undefined) return undefined
  const after = isRecord(input.after) ? input.after : undefined
  if (!after) return undefined
  const afterVal = asNumber(after[key])
  if (afterVal === undefined) return 'not-measured'
  if (INTEGER_METRICS.has(key) && afterVal === beforeVal) return 'unchanged'
  if (expectedTradeoffSet(input).has(key)) return 'expected-trade-off'
  const claimed = claimedOf(input, key)
  if (claimed) return claimed
  const band = noiseBandOf(input, key)
  if (!band) return undefined
  const direction = key === 'avgFps' ? 'higher-better' : 'lower-better'
  return claimAbDelta(beforeVal, afterVal, band, direction)
}

function signedNumber(value: number): string {
  const rounded = Math.round(value)
  return rounded > 0 ? `+${rounded}` : String(rounded)
}

export function formatMetricDelta(key: string, before: number, after: number): string {
  const delta = after - before
  if (PERCENT_METRICS.has(key) && before !== 0) {
    return `${signedNumber((delta / before) * 100)}%`
  }
  return signedNumber(delta)
}

function fragmentFor(input: JsonMap, key: string): string | undefined {
  const badge = badgeForMetric(input, key)
  if (badge !== 'win' && badge !== 'loss' && badge !== 'expected-trade-off') return undefined
  const baseline = isRecord(input.baseline) ? input.baseline : undefined
  const after = isRecord(input.after) ? input.after : undefined
  if (!baseline || !after) return undefined
  const beforeVal = asNumber(baseline[key])
  const afterVal = asNumber(after[key])
  if (beforeVal === undefined || afterVal === undefined) return undefined
  const delta = formatMetricDelta(key, beforeVal, afterVal)
  const short = metricShortLabel(key)
  if (badge === 'expected-trade-off') return `${short} ${delta} (expected trade-off)`
  if (badge === 'win' && NOISY_METRICS.has(key)) return `${short} ${delta} (outside noise)`
  return `${short} ${delta}`
}

const CARD_ORDER = [...COST_METRICS, ...SCENE_FACT_METRICS]

export function formatVerdictStrip(input: JsonMap): string {
  const baseline = isRecord(input.baseline) ? input.baseline : undefined
  const after = isRecord(input.after) ? input.after : undefined
  if (!baseline || !after) return ''
  const claimedKeys = isRecord(input.claimed) ? Object.keys(input.claimed) : []
  const order = [...CARD_ORDER, ...claimedKeys, ...expectedTradeoffSet(input)]
  const seen = new Set<string>()
  const parts: string[] = []
  for (const key of order) {
    if (seen.has(key)) continue
    seen.add(key)
    const part = fragmentFor(input, key)
    if (part) parts.push(part)
  }
  return parts.join(' · ')
}
