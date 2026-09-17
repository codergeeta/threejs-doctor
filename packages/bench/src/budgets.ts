import type { Profile } from '@threejs-doctor/core'

export interface LowEndBudget {
  maxDrawCalls: number
  maxP95FrameTimeMs: number
  maxDpr: number
  minAvgFps: number
}

const LOW: Record<Exclude<Profile, 'auto'>, LowEndBudget> = {
  marketing: { maxDrawCalls: 60, maxP95FrameTimeMs: 22, maxDpr: 1, minAvgFps: 45 },
  product: { maxDrawCalls: 80, maxP95FrameTimeMs: 24, maxDpr: 1, minAvgFps: 40 },
  game: { maxDrawCalls: 100, maxP95FrameTimeMs: 28, maxDpr: 1, minAvgFps: 35 },
  cad: { maxDrawCalls: 100, maxP95FrameTimeMs: 28, maxDpr: 1, minAvgFps: 35 },
}

export function getLowEndBudget(profile: Exclude<Profile, 'auto'>): LowEndBudget {
  const budget = LOW[profile]
  if (!budget) {
    throw new Error(`No low-end budget for profile: ${profile}`)
  }
  return budget
}
