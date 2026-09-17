import type { Profile, SceneSnapshot } from '@threejs-doctor/core'

export type ConcreteProfile = Exclude<Profile, 'auto'>

export interface ProfileBudgets {
  maxDrawCalls: number
  maxShadowCasters: number
  maxDpr: number
  maxLights: number
  maxEstimatedVramBytes: number
}

export const PROFILE_BUDGETS: Record<ConcreteProfile, ProfileBudgets> = {
  marketing: { maxDrawCalls: 80, maxShadowCasters: 1, maxDpr: 1.5, maxLights: 3, maxEstimatedVramBytes: 64_000_000 },
  product: { maxDrawCalls: 100, maxShadowCasters: 2, maxDpr: 2, maxLights: 4, maxEstimatedVramBytes: 128_000_000 },
  game: { maxDrawCalls: 150, maxShadowCasters: 3, maxDpr: 2, maxLights: 6, maxEstimatedVramBytes: 256_000_000 },
  cad: { maxDrawCalls: 120, maxShadowCasters: 2, maxDpr: 2, maxLights: 4, maxEstimatedVramBytes: 256_000_000 },
}

export function resolveProfile(profile: Profile, snapshot: SceneSnapshot): ConcreteProfile {
  if (profile !== 'auto') return profile
  if (snapshot.meshCount > 200 || snapshot.drawCalls > 150) return 'cad'
  if (snapshot.lightCount >= 4 && snapshot.meshCount > 50) return 'game'
  if (snapshot.textureCount <= 6 && snapshot.meshCount <= 20) return 'product'
  return 'marketing'
}
