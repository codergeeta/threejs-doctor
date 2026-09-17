import type { SceneSnapshot } from '@threejs-doctor/core'
import type { Finding } from './types.js'
import type { ConcreteProfile } from './profiles.js'
import { PROFILE_BUDGETS } from './profiles.js'

const SEVERITY_PENALTY = { info: 2, warn: 8, error: 18 } as const

export function computeDoctorScore(
  findings: Finding[],
  snapshot: SceneSnapshot,
  profile: ConcreteProfile,
): number {
  let score = 100
  for (const f of findings) score -= SEVERITY_PENALTY[f.severity]
  const budgets = PROFILE_BUDGETS[profile]
  if (snapshot.drawCalls > budgets.maxDrawCalls) {
    score -= Math.min(15, Math.floor((snapshot.drawCalls / budgets.maxDrawCalls - 1) * 10))
  }
  if (snapshot.estimatedVramBytes > budgets.maxEstimatedVramBytes) {
    score -= 10
  }
  return Math.max(0, Math.min(100, Math.round(score)))
}
