import type { QualityMode, QualityTier } from '@threejs-doctor/core'

export interface QualityHudState {
  score: number
  profile: string
  qualityMode: QualityMode
  startTier: QualityTier
  tier: QualityTier
  ttfiMs?: number
  avgFps?: number
  p95FrameTimeMs?: number
  simPassCount?: number
  bytesLoaded?: number
  exclusive?: boolean
}

export function formatQualityHud(state: QualityHudState): { line1: string; line2: string } {
  const tierPath =
    state.startTier === state.tier ? state.tier : `${state.startTier}→${state.tier}`
  let line1 = `Doctor Score ${state.score} · ${state.profile} · ${state.qualityMode} · ${tierPath}`
  if (state.qualityMode === 'advise') line1 = `ADVISE ${line1}`
  if (state.qualityMode === 'takeover' && state.exclusive) line1 += ' · exclusive'
  const parts: string[] = []
  if (state.ttfiMs !== undefined) parts.push(`TTFI ${Math.round(state.ttfiMs)}ms`)
  if (state.avgFps !== undefined && state.p95FrameTimeMs !== undefined) {
    parts.push(`${Math.round(state.avgFps)} FPS p95=${Math.round(state.p95FrameTimeMs)}ms`)
  }
  if (state.simPassCount !== undefined) parts.push(`simPasses ${state.simPassCount}`)
  if (state.bytesLoaded !== undefined) {
    const mb = state.bytesLoaded / 1_000_000
    parts.push(`bytes ${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)}MB`)
  }
  return { line1, line2: parts.join(' · ') }
}
