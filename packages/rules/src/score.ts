import type { SceneSnapshot } from '@threejs-doctor/core'
import type { Finding } from './types.js'
import type { ConcreteProfile } from './profiles.js'
import { PROFILE_BUDGETS } from './profiles.js'

const SEVERITY_PENALTY = { info: 2, warn: 8, error: 18 } as const

export function computeDoctorScore(
  findings: Finding[],
  snapshot: SceneSnapshot,
  profile: ConcreteProfile,
  previous?: SceneSnapshot,
): number {
  let score = 100
  for (const f of findings) score -= SEVERITY_PENALTY[f.severity]
  const budgets = PROFILE_BUDGETS[profile]
  if (snapshot.drawCalls > budgets.maxDrawCalls) {
    score -= Math.min(15, Math.floor((snapshot.drawCalls / budgets.maxDrawCalls - 1) * 10))
  }
  if (
    typeof snapshot.estimatedVramBytes === 'number' &&
    snapshot.estimatedVramBytes > budgets.maxEstimatedVramBytes
  ) {
    score -= 10
  }
  const triCost = snapshot.triangles
  if (typeof triCost === 'number' && triCost > budgets.maxTriangles) {
    score -= Math.min(15, Math.floor((triCost / budgets.maxTriangles - 1) * 10))
  }
  if (previous) {
    const prevTri = previous.triangles
    const nextTri = snapshot.triangles
    if (typeof prevTri === 'number' && typeof nextTri === 'number' && prevTri > 0 && nextTri < prevTri * 0.8) {
      score += Math.min(10, Math.round((1 - nextTri / prevTri) * 12))
    }
    const prevGpu = previous.gpuFrameTimeMs
    const nextGpu = snapshot.gpuFrameTimeMs
    if (
      typeof prevGpu === 'number' &&
      typeof nextGpu === 'number' &&
      prevGpu > 0 &&
      nextGpu < prevGpu * 0.9
    ) {
      score += Math.min(8, Math.round((1 - nextGpu / prevGpu) * 20))
    }
  }
  return Math.max(0, Math.min(100, Math.round(score)))
}
